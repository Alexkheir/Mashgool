// The one input style the AI modal's three steps share. Extracted so the paste
// textarea, the transcript editor, and the review form cannot drift apart — they
// sit inside the same dialog, where a half-pixel difference in border colour is
// visible.
export const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20';
