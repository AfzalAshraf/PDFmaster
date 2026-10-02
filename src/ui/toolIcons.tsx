import React from 'react';
import {
  CircleDot,
  Eraser,
  FormInput,
  Hand,
  Highlighter,
  ImagePlus,
  Link2,
  List,
  MousePointer2,
  Pen,
  PenTool,
  RectangleHorizontal,
  Ruler,
  Shapes,
  SquareCheck,
  Stamp,
  StickyNote,
  Strikethrough,
  TextCursorInput,
  Trash2,
  Type,
  Underline,
  Waves,
} from 'lucide-react';

const MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  MousePointer2,
  Hand,
  Type,
  TextCursorInput,
  ImagePlus,
  Shapes,
  Pen,
  Highlighter,
  Underline,
  Strikethrough,
  Waves,
  StickyNote,
  Stamp,
  PenTool,
  Link2,
  Ruler,
  Eraser,
  Trash2,
  FormInput,
  SquareCheck,
  CircleDot,
  List,
  RectangleHorizontal,
};

export function toolIcon(name: string, props: { size?: number; strokeWidth?: number; className?: string } = {}): React.ReactElement {
  const Component = MAP[name] ?? MousePointer2;
  return <Component strokeWidth={1.75} {...props} />;
}

export { MAP as TOOL_ICONS };
