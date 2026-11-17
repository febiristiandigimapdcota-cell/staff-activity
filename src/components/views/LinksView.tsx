import React from 'react';
import {
  Link2,
  ExternalLink,
  Video,
  Headphones,
  ClipboardCheck,
  UserCheck
} from 'lucide-react';
import { QUICK_OPERATIONAL_LINKS } from '../../data/defaultData';
import { TryOnDevicesIcon } from '../common/TryOnDevicesIcon';

export const LinksView: React.FC = () => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'OPS':
        return <Video className="w-4 h-4" />;
      case 'TryOn':
        return <TryOnDevicesIcon className="w-5 h-4 text-purple-300" />;
      case 'Checklist':
        return <ClipboardCheck className="w-4 h-4" />;
      default:
        return <UserCheck className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="liquid-glass-card p-5 sm:p-7 rounded-[28px]">
        <div className="pb-4 border-b border-zinc-200/60 mb-6">
          <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center">
            <Link2 className="w-4 h-4 mr-2 text-zinc-700" />
            <span>Link Akses Cepat Form Operasional</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {QUICK_OPERATIONAL_LINKS.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 sm:p-5 rounded-[22px] border border-white/80 hover:border-zinc-300 transition-all flex items-center justify-between bg-white/70 hover:bg-white/95 group shadow-xs hover:shadow-lg active:scale-[0.99]"
            >
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="p-3 bg-zinc-900 text-white rounded-2xl shadow-sm shrink-0 group-hover:scale-105 transition">
                  {item.id === 'tryon-airpods' ? (
                    <Headphones className="w-4 h-4 text-purple-400" />
                  ) : (
                    getIcon(item.type)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-bold text-xs sm:text-sm text-zinc-900 group-hover:underline truncate">
                      {item.title}
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-lg shrink-0 border border-zinc-200/60">
                      {item.badge}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-2 text-zinc-400 group-hover:text-zinc-900 transition shrink-0 ml-2">
                <ExternalLink className="w-4 h-4" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
