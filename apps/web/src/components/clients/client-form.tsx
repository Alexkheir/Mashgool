'use client';

import { useState, type FormEvent } from 'react';
import {
  CLIENT_COLORS,
  CreateClientDto,
  UpdateClientDto,
  suggestShortCode,
  type CreateClientInput,
  type UpdateClientInput
} from '@/dtos/client.dto';
import { cn } from '@/lib/utils';
import {
  ApiError,
  useCreateClient,
  useUpdateClient,
  type Client
} from '@/lib/use-clients';
import { Modal } from '@/components/ui/modal';

interface ClientFormProps {
  open: boolean;
  onClose: () => void;
  // Present → edit that client; absent → create a new one.
  client?: Client;
}

const inputClass =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-950 outline-none focus:border-neutral-900';

export function ClientForm({ open, onClose, client }: ClientFormProps) {
  const isEdit = Boolean(client);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const [name, setName] = useState(client?.name ?? '');
  const [shortCode, setShortCode] = useState(client?.shortCode ?? '');
  const [description, setDescription] = useState(client?.description ?? '');
  const [color, setColor] = useState<string>(client?.color ?? CLIENT_COLORS[0]);
  // Once the user edits the short code by hand, stop auto-suggesting from name.
  const [shortCodeTouched, setShortCodeTouched] = useState(isEdit);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const pending = createClient.isPending || updateClient.isPending;

  function onNameChange(value: string) {
    setName(value);
    if (!isEdit && !shortCodeTouched) {
      setShortCode(suggestShortCode(value));
    }
  }

  function fail(err: unknown) {
    if (err instanceof ApiError) {
      // 409 collisions come back on name or short code — point the user at the
      // right field; otherwise show a form-level message.
      if (/short code/i.test(err.message)) setFieldErrors({ shortCode: err.message });
      else if (/name/i.test(err.message)) setFieldErrors({ name: err.message });
      else setFormError(err.message);
    } else {
      setFormError('Something went wrong. Please try again.');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    if (isEdit && client) {
      // Only send changed fields. description cleared → null (explicit clear).
      const input: UpdateClientInput = {};
      if (name.trim() !== client.name) input.name = name.trim();
      if (color !== client.color) input.color = color as UpdateClientInput['color'];
      const nextDesc = description.trim();
      if (nextDesc !== (client.description ?? '')) {
        input.description = nextDesc === '' ? null : nextDesc;
      }

      if (Object.keys(input).length === 0) {
        onClose();
        return;
      }

      const parsed = UpdateClientDto.safeParse(input);
      if (!parsed.success) {
        setFieldErrors(flattenFirst(parsed.error.flatten().fieldErrors));
        return;
      }

      updateClient.mutate(
        { id: client.id, input: parsed.data },
        { onSuccess: onClose, onError: fail }
      );
      return;
    }

    const raw: CreateClientInput = {
      name: name.trim(),
      shortCode: shortCode.trim().toUpperCase(),
      ...(description.trim() ? { description: description.trim() } : {}),
      color: color as CreateClientInput['color']
    };
    const parsed = CreateClientDto.safeParse(raw);
    if (!parsed.success) {
      setFieldErrors(flattenFirst(parsed.error.flatten().fieldErrors));
      return;
    }

    createClient.mutate(parsed.data, { onSuccess: onClose, onError: fail });
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit client' : 'New client'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Name</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Brand Studio"
            autoFocus
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">
            Short code
          </label>
          <input
            className={cn(inputClass, isEdit && 'cursor-not-allowed bg-neutral-100 text-neutral-500')}
            value={shortCode}
            disabled={isEdit}
            maxLength={5}
            onChange={(e) => {
              setShortCodeTouched(true);
              setShortCode(e.target.value.toUpperCase());
            }}
            placeholder="BS"
          />
          <p className="mt-1 text-xs text-neutral-500">
            {isEdit
              ? 'The short code is permanent — it prefixes every task key and can’t change.'
              : '2–5 uppercase letters or digits. Used as the prefix for this client’s task keys.'}
          </p>
          {fieldErrors.shortCode && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.shortCode}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">
            Description <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            className={cn(inputClass, 'min-h-20 resize-y')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this workspace is for…"
          />
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>
          )}
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-800">Color</span>
          <div className="flex flex-wrap gap-2">
            {CLIENT_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Select color ${swatch}`}
                aria-pressed={color === swatch}
                onClick={() => setColor(swatch)}
                className={cn(
                  'h-7 w-7 rounded-full ring-offset-2 transition',
                  color === swatch && 'ring-2 ring-neutral-900'
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Zod's fieldErrors gives string[] per field; the form shows one line per field.
function flattenFirst(
  fieldErrors: Record<string, string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) out[key] = messages[0];
  }
  return out;
}
