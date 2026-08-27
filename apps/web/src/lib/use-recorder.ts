'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// In-browser voice recording (Feature 14). Wraps MediaRecorder and getUserMedia
// so the component that uses it deals in "start / stop / discard" and a piece of
// state, not in streams, chunks, and object URLs.
//
// Everything here is browser-only and effect-driven: the capability check runs
// after mount rather than during render, because `navigator` does not exist
// during the server render and a hydration mismatch on the record button would
// be worse than a frame of "checking".

// The product cap. Recording stops itself here, and the user is told why.
export const MAX_RECORDING_SECONDS = 60;

// Ordered by preference. Chrome and Firefox record WebM/Opus; Safari records
// MP4/AAC and ignores the hint entirely, which is why the last entry is
// "whatever the browser chooses" rather than a format we insist on.
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

export type RecorderStatus =
  // Nothing recorded yet.
  | 'idle'
  // Waiting on the permission prompt. Kept distinct from 'recording' so the UI
  // does not start a timer against a dialog the user has not answered.
  | 'requesting'
  | 'recording'
  // A finished take, held in memory for playback and submission.
  | 'recorded';

export interface Recording {
  blob: Blob;
  // An object URL for the <audio> element. Revoked when the take is discarded or
  // the hook unmounts — a leaked one pins the whole recording in memory.
  url: string;
  seconds: number;
}

export interface RecorderError {
  // `permission` is the only one the user can fix themselves, and it gets its
  // own instructions in the UI rather than a generic failure message.
  kind: 'permission' | 'no-microphone' | 'failed';
  message: string;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function toRecorderError(error: unknown): RecorderError {
  const name = error instanceof Error ? error.name : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'permission',
      message: 'Microphone access was blocked.'
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      kind: 'no-microphone',
      message: 'No microphone was found. Connect one, or upload an audio file instead.'
    };
  }
  return {
    kind: 'failed',
    message: 'Recording could not start. Try again, or upload an audio file instead.'
  };
}

export function useRecorder() {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<RecorderError | null>(null);
  // True when the 60-second cap ended the take rather than the user. The UI says
  // so explicitly — a recording that stops on its own is otherwise indistinguishable
  // from one that failed.
  const [autoStopped, setAutoStopped] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirrors `recording.url` for the unmount cleanup, which must not depend on
  // state it would otherwise have to re-subscribe to on every take.
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    setSupported(
      typeof MediaRecorder !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  // Releases the microphone. Without this the browser's "recording" indicator
  // stays lit after the take ends, which reads as the app still listening.
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearTick();
      releaseStream();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [clearTick, releaseStream]);

  const stop = useCallback(() => {
    // `stop()` fires `onstop` asynchronously; the take is assembled there, so
    // this only asks.
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setAutoStopped(false);
    setStatus('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      setStatus('idle');
      setError(toRecorderError(cause));
      return;
    }

    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        clearTick();
        releaseStream();

        // `recorder.mimeType` is the format actually used, which may not be the
        // one requested — Safari in particular. It is carried onto the blob so
        // the upload declares what it really is.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const elapsed = Math.min(
          Math.round((Date.now() - startedAtRef.current) / 1000),
          MAX_RECORDING_SECONDS
        );

        // A take with no audio data at all (an instantly-revoked permission, a
        // device unplugged mid-recording) is not a recording — surfacing it
        // would put an unplayable file in front of the user.
        if (blob.size === 0) {
          setStatus('idle');
          setError(toRecorderError(new Error('empty')));
          return;
        }

        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setRecording({ blob, url, seconds: elapsed });
        setSeconds(elapsed);
        setStatus('recorded');
      };

      startedAtRef.current = Date.now();
      setSeconds(0);
      setStatus('recording');
      recorder.start();

      // Four ticks a second so the displayed timer never appears to skip, and so
      // the cap lands within a quarter-second of 60 rather than up to a second
      // past it.
      tickRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setSeconds(Math.min(Math.floor(elapsed), MAX_RECORDING_SECONDS));
        if (elapsed >= MAX_RECORDING_SECONDS) {
          setAutoStopped(true);
          stop();
        }
      }, 250);
    } catch (cause) {
      releaseStream();
      setStatus('idle');
      setError(toRecorderError(cause));
    }
  }, [clearTick, releaseStream, stop]);

  // One action, per the spec: discard the take and be ready to record again.
  const discard = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    chunksRef.current = [];
    setRecording(null);
    setSeconds(0);
    setAutoStopped(false);
    setError(null);
    setStatus('idle');
  }, []);

  return { supported, status, seconds, recording, error, autoStopped, start, stop, discard };
}

// mm:ss, for the live timer and the finished take's length.
export function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
