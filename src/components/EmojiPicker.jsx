import React, { useRef, useState } from 'react';
import { Search, SmilePlus } from 'lucide-react';
import { CHAT_EMOJIS } from '../lib/chatProtocol';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export const EmojiPicker = ({
  onSelect,
  disabled = false,
  label = 'Choose emoji',
  align = 'start',
  side = 'top',
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const emojis = (
    normalizedQuery
      ? CHAT_EMOJIS.filter(item => (
          item.label.toLocaleLowerCase().includes(normalizedQuery)
          || item.keywords.includes(normalizedQuery)
          || item.emoji.includes(normalizedQuery)
        ))
      : CHAT_EMOJIS
  );

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen) setQuery('');
  };

  const handleSelect = (emoji) => {
    onSelect(emoji);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={compact ? 'size-7 rounded-lg text-zinc-500 hover:text-zinc-100' : 'size-11'}
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
        className="w-[min(18rem,calc(100vw-1.5rem))] p-3"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            ref={searchRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search emoji"
            className="h-9 pl-9 text-xs"
            aria-label="Search emoji"
          />
        </div>
        {emojis.length ? (
          <div className="mt-2 grid grid-cols-5 gap-1" role="group" aria-label="Emoji choices">
            {emojis.map(item => (
              <Button
                key={item.emoji}
                variant="ghost"
                size="icon"
                className="size-10 text-lg"
                onClick={() => handleSelect(item.emoji)}
                aria-label={item.label}
              >
                <span aria-hidden="true">{item.emoji}</span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="py-5 text-center text-xs text-zinc-500">No matching emoji</p>
        )}
      </PopoverContent>
    </Popover>
  );
};
