import React from 'react';
import {
  Bookmark,
  FileText,
  Images,
  Layers,
  MessageSquare,
  Paperclip,
  Search,
  Settings2,
} from 'lucide-react';
import { useUI } from '../state/ui';
import type { LeftPanel } from '../state/ui';
import { TOOL_DEFS, type ToolId } from '../core/constants';
import { toolIcon } from './toolIcons';
import { TOOL_HINTS } from '../state/ui';

const RAIL: { group: string; tools: ToolId[] }[] = [
  { group: 'Edit', tools: ['select', 'hand', 'text', 'editText', 'image', 'shape', 'draw'] },
  { group: 'Comment', tools: ['highlight', 'underline', 'strike', 'squiggly', 'note', 'link', 'measure'] },
  { group: 'Stamp', tools: ['stamp', 'signature'] },
  { group: 'Forms', tools: ['form-text', 'form-checkbox', 'form-radio', 'form-dropdown', 'form-button'] },
  { group: 'Protect', tools: ['redact', 'crop', 'eraser'] },
];

const PANEL_BUTTONS: { panel: LeftPanel; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string }[] = [
  { panel: 'thumbs', icon: Images, label: 'Page thumbnails' },
  { panel: 'bookmarks', icon: Bookmark, label: 'Bookmarks' },
  { panel: 'comments', icon: MessageSquare, label: 'Comments' },
  { panel: 'attachments', icon: Paperclip, label: 'Attachments' },
  { panel: 'search', icon: Search, label: 'Search' },
];

export const ToolRail: React.FC = () => {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const leftPanel = useUI((s) => s.leftPanel);
  const setLeftPanel = useUI((s) => s.setLeftPanel);
  const setRightPanel = useUI((s) => s.setRightPanel);

  return (
    <div
      className="pm-no-print flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ink-700 bg-ink-850 py-1.5"
      data-testid="tool-rail"
    >
      {RAIL.map((section, index) => (
        <React.Fragment key={section.group}>
          {index > 0 ? <div className="my-1 h-px w-6 shrink-0 bg-ink-700" /> : null}
          {section.tools.map((id) => {
            const def = TOOL_DEFS[id];
            if (!def) return null;
            const active = tool === id || (id === 'shape' && tool === 'shape');
            return (
              <button
                key={id}
                type="button"
                title={`${def.label}${def.shortcut ? ` (${def.shortcut})` : ''} — ${TOOL_HINTS[id] ?? def.description}`}
                onClick={() => setTool(id)}
                className={`pm-focus-ring relative grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors ${
                  active ? 'bg-accent/20 text-accent' : 'text-ink-200 hover:bg-ink-700 hover:text-white'
                }`}
              >
                {toolIcon(def.icon, { size: 16, strokeWidth: 1.75 })}
                {active ? <span className="absolute -left-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" /> : null}
              </button>
            );
          })}
        </React.Fragment>
      ))}

      <div className="my-1 h-px w-6 shrink-0 bg-ink-700" />

      {PANEL_BUTTONS.map(({ panel, icon: Icon, label }) => (
        <button
          key={panel}
          type="button"
          title={label}
          onClick={() => setLeftPanel(panel)}
          className={`pm-focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors ${
            leftPanel === panel ? 'bg-ink-700 text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-white'
          }`}
        >
          <Icon size={16} strokeWidth={1.75} />
        </button>
      ))}

      <div className="flex-1" />

      <div className="my-1 h-px w-6 shrink-0 bg-ink-700" />
      <button
        type="button"
        title="Document properties"
        onClick={() => setRightPanel('metadata')}
        className="pm-focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-300 transition-colors hover:bg-ink-700 hover:text-white"
      >
        <Settings2 size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        title="Organise pages"
        onClick={() => setRightPanel('organize')}
        className="pm-focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-300 transition-colors hover:bg-ink-700 hover:text-white"
      >
        <Layers size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        title="Document summary"
        onClick={() => setRightPanel('properties')}
        className="pm-focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-300 transition-colors hover:bg-ink-700 hover:text-white"
      >
        <FileText size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
};
