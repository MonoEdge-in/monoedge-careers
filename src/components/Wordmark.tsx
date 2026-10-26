/**
 * The supplied mark plus the name set in the display face.
 *
 * Assets are generated from brand/logo-source.jpeg by crop-logo.mjs — the
 * original has a wide white margin that would leave the mark tiny at header
 * size. Re-run that script if the source is ever replaced.
 *
 * `nested` means the page sits one level below the site root (a role page),
 * which decides the asset path. On a role page the mark returns to the
 * careers index. On the index it returns to the company site.
 */
export function Wordmark({ nested = false }: { nested?: boolean }) {
  return (
    <a
      href={nested ? '../' : 'https://www.monoedge.in'}
      className="flex items-center gap-2.5 no-underline transition-opacity hover:opacity-70"
    >
      <img
        src={nested ? '../monoedge-mark.png' : './monoedge-mark.png'}
        alt="Monoedge Systems logo"
        width={30}
        height={20}
        className="h-5 w-auto shrink-0"
      />
      <span className="t-display text-[0.9375rem] tracking-[0.02em]">MonoEdge</span>
    </a>
  );
}
