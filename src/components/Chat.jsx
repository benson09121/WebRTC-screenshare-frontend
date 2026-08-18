import React, { useState, useRef, useEffect } from 'react';
import { useWebRTC } from '../context/WebRTCContext';
import { Send, MessageSquare, X } from 'lucide-react';

export const Chat = () => {
  const { chatMessages, sendMessage } = useWebRTC();
  const [text, setText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const endOfMessagesRef = useRef(null);
  const unreadCount = chatMessages.length; // Basic unread logic can be improved

  useEffect(() => {
    if (endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isOpen]);

  const handleSend = (e) => {
    e.preventDefault();
    if (text.trim()) {
      sendMessage(text.trim());
      setText('');
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className={`absolute bottom-8 right-8 bg-blue-600/90 backdrop-blur-md hover:bg-blue-500 text-white p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.2)] z-30 transition-all duration-500 flex items-center justify-center border border-blue-400/20 group hover:scale-105 hover:-translate-y-1 ${isOpen ? 'opacity-0 pointer-events-none scale-90 translate-y-4' : 'opacity-100 scale-100 translate-y-0'}`}
      >
        <MessageSquare size={24} className="group-hover:animate-bounce" />
        {chatMessages.length > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-gray-900 shadow-lg shadow-red-500/50 animate-pulse">
            {chatMessages.length}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      <div 
        className={`absolute top-6 right-6 w-[340px] h-[calc(100vh-140px)] max-h-[700px] bg-gray-900/60 backdrop-blur-2xl rounded-3xl border border-gray-700/50 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)] z-40 flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0 pointer-events-none'}`}
      >
        <div className="bg-gray-800/40 p-5 border-b border-gray-700/50 flex justify-between items-center backdrop-blur-md">
          <h3 className="font-semibold text-gray-200 flex items-center gap-3 tracking-wide">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400">
              <MessageSquare size={16} />
            </div>
            Peer Chat
          </h3>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white hover:bg-gray-700/50 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar bg-gradient-to-b from-transparent to-gray-900/40">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center border border-gray-700/50">
                <MessageSquare size={24} className="text-gray-600" />
              </div>
              <p>No messages yet.<br/>Direct P2P connection secured.</p>
            </div>
          ) : (
            chatMessages.map((msg, i) => (
              <div 
                key={i} 
                className={`flex ${msg.from === 'local' ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.3s_ease-out]`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm ${
                    msg.from === 'local' 
                      ? 'bg-blue-600/90 text-white rounded-tr-sm border border-blue-500/50' 
                      : 'bg-gray-800/80 text-gray-200 rounded-tl-sm border border-gray-700/50'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}
          <div ref={endOfMessagesRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-gray-900/80 border-t border-gray-700/50 flex gap-3 backdrop-blur-md">
          <input 
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-full px-5 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:bg-gray-800 transition-all placeholder:text-gray-500 shadow-inner"
          />
          <button 
            type="submit"
            disabled={!text.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:border disabled:border-gray-700/50 text-white p-3 rounded-full transition-all flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.3)] disabled:shadow-none"
          >
            <Send size={18} className={text.trim() ? 'translate-x-0.5' : ''} />
          </button>
        </form>
      </div>
    </>
  );
};
