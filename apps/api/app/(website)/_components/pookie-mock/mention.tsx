export const Mention = ({ name, href }: { name: string; href?: string }) => {
  const content = (
    <span className="relative inline-flex h-[1.25em] shrink-0 items-center px-[0.2em] text-[#006fa8] before:absolute before:top-[0.13em] before:right-[-0.17em] before:bottom-[0.09em] before:left-[-0.04em] before:[transform:rotate(-0.8deg)_skewX(-3deg)] before:[border-radius:8px_5px_7px_4px/5px_8px_4px_7px] before:bg-[linear-gradient(96deg,rgb(143_218_255_/_0.42)_0%,rgb(126_209_255_/_0.56)_48%,rgb(159_226_255_/_0.42)_100%)] before:content-[''] after:absolute after:top-[0.35em] after:right-[-0.09em] after:left-[0.09em] after:h-[0.52em] after:[transform:rotate(1deg)] after:rounded-full after:bg-[rgb(87_190_255_/_0.1)] after:content-['']">
      <span className="relative z-[1]">@{name}</span>
    </span>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="no-underline">
        {content}
      </a>
    );
  }

  return content;
};
