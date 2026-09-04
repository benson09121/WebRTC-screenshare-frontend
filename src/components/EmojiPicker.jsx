import React, { Suspense, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const Picker = React.lazy(() => import('emoji-picker-react'));

export const EmojiPicker = ({
  onSelect,
  disabled = false,
  label = 'Choose emoji',
  align = 'start',
  side = 'top',
  compact = false,
  triggerClassName = '',
}) => {
  const [open, setOpen] = useState(false);

  const handleSelect = ({ emoji }) => {
    onSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`${
            compact
              ? 'size-7 rounded-lg text-zinc-500 hover:text-zinc-100'
              : 'size-11'
          } ${triggerClassName}`}
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          <SmilePlus className={compact ? 'size-3.5' : 'size-4'} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-chat-emoji-picker="true"
        align={align}
        side={side}
        className="w-auto overflow-hidden p-0"
      >
        <Suspense
          fallback={
            <div className="grid h-72 w-[min(22rem,calc(100vw-1.5rem))] place-items-center text-xs text-zinc-500">
              Loading emoji…
            </div>
          }
        >
          <Picker
            onEmojiClick={handleSelect}
            autoFocusSearch
            emojiStyle="native"
            theme="dark"
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            width="min(22rem, calc(100vw - 1.5rem))"
            height={420}
            searchPlaceHolder="Search all emoji"
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
};
