"use client";

import { useCallback, useState } from "react";

import animations from "./animations.module.css";
import { BorderedIconButton } from "./bordered-icon-button";
import { HeadphonesIcon } from "./icons";
import { cx } from "./styles";

const MUSIC_NOTE_PALETTES = [
  ["#ff3b30", "#ff6961"],
  ["#ff9500", "#ffb340"],
  ["#ffcc00", "#ffdc3d"],
  ["#34c759", "#62d97a"],
  ["#00c7be", "#4ddbd5"],
  ["#007aff", "#4aa3ff"],
  ["#5856d6", "#7c7bea"],
  ["#af52de", "#c77df0"],
] as const;

const DEFAULT_PALETTE_INDEX = 1;
const DEFAULT_NOTE_COLORS = MUSIC_NOTE_PALETTES[DEFAULT_PALETTE_INDEX];

const getNextPaletteIndex = (currentIndex: number) => {
  let nextIndex = Math.floor(Math.random() * MUSIC_NOTE_PALETTES.length);

  if (nextIndex === currentIndex) {
    nextIndex = (nextIndex + 1) % MUSIC_NOTE_PALETTES.length;
  }

  return nextIndex;
};

const MusicNotes = ({ colors }: { colors: readonly [string, string] }) => {
  const notes = [
    {
      className: cx(animations.musicNoteTwo, "top-px left-[17px] h-auto w-4"),
      path: "M13 2V3C13 2 13.0004 2 13.0009 2H13.0018L13.004 2.00001L13.0093 2.00003L13.0238 2.00018C13.0351 2.00034 13.0499 2.00062 13.0678 2.00112C13.1037 2.00212 13.1526 2.00401 13.2134 2.00755C13.3349 2.01463 13.5043 2.02834 13.7126 2.05493C14.1282 2.10799 14.7035 2.21296 15.3636 2.42142C16.6838 2.8383 18.3661 3.67725 19.7682 5.35982C20.1218 5.78409 20.0645 6.41466 19.6402 6.76822C19.2159 7.12179 18.5853 7.06446 18.2318 6.64018C17.1339 5.32275 15.8162 4.6617 14.7614 4.32858C14.4848 4.24123 14.2278 4.177 14 4.12979V17V17.5C14 17.6385 13.9719 17.7704 13.921 17.8903C13.501 20.227 11.4576 22 9 22C6.23858 22 4 19.7614 4 17C4 14.2386 6.23858 12 9 12C10.1256 12 11.1643 12.3719 12 12.9996V3C12 2.44772 12.4477 2 13 2Z",
    },
    {
      className: cx(
        animations.musicNoteThree,
        "top-[-17px] left-5 h-auto w-[13px]",
      ),
      path: "M19.4106 4.30517C19.7175 4.24937 20 4.48516 20 4.79711V11.7576C19.285 11.2789 18.4251 10.9998 17.5 10.9998C15.0147 10.9998 13 13.0145 13 15.4998C13 17.9851 15.0147 19.9998 17.5 19.9998C19.6674 19.9998 21.4769 18.4675 21.9043 16.4272C21.9657 16.2976 22 16.1527 22 15.9998V15.4998V4.79711C22 3.23735 20.5874 2.05841 19.0528 2.33743L11.0528 3.79198C9.86406 4.00811 9 5.04344 9 6.25165V13.7576C8.28495 13.2789 7.42507 12.9998 6.5 12.9998C4.01472 12.9998 2 15.0145 2 17.4998C2 19.9851 4.01472 21.9998 6.5 21.9998C8.66739 21.9998 10.4769 20.4675 10.9043 18.4272C10.9657 18.2976 11 18.1527 11 17.9998V17.4998V6.25165C11 6.01001 11.1728 5.80294 11.4106 5.75972L19.4106 4.30517Z",
    },
  ] as const;

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {notes.map((note) => (
        <svg
          key={note.className}
          className={cx(animations.musicNote, "absolute", note.className)}
          style={{ color: colors[notes.indexOf(note)] }}
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="currentColor"
            fillRule="evenodd"
            clipRule="evenodd"
            d={note.path}
          />
        </svg>
      ))}
    </span>
  );
};

export const AudioIconButton = () => {
  const [paletteIndex, setPaletteIndex] = useState(DEFAULT_PALETTE_INDEX);

  const randomizeNoteColors = useCallback(() => {
    setPaletteIndex((currentIndex) => getNextPaletteIndex(currentIndex));
  }, []);

  return (
    <BorderedIconButton
      label="Join audio"
      onPointerEnter={randomizeNoteColors}
      variant="audio"
    >
      <HeadphonesIcon />
      <MusicNotes
        colors={MUSIC_NOTE_PALETTES[paletteIndex] ?? DEFAULT_NOTE_COLORS}
      />
    </BorderedIconButton>
  );
};
