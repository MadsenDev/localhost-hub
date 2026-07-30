import React from 'react';

interface IconProps {
  size?: number;
  sw?: number;
  style?: React.CSSProperties;
  [key: string]: unknown;
}

type IconComponent = (props?: IconProps | null) => React.ReactElement;

const wrap = (children: React.ReactNode, size = 16): IconComponent => (props) => (
  <svg
    width={props?.size ?? size}
    height={props?.size ?? size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={props?.sw ?? 1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={props?.style}
  >
    {children}
  </svg>
);

export const Ic = {
  Home:     wrap(<><path d="M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 0 1-.5.5h-3v-4h-4v4h-3a.5.5 0 0 1-.5-.5V7.5z"/></>),
  Stack:    wrap(<><path d="M2.5 5L8 2.5 13.5 5 8 7.5 2.5 5z"/><path d="M2.5 8L8 10.5 13.5 8"/><path d="M2.5 11L8 13.5 13.5 11"/></>),
  Folder:   wrap(<><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.379a1.5 1.5 0 0 1 1.06.44L8 4.5h4.5A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z"/></>),
  Play:     wrap(<><path d="M5 3.5v9l7-4.5-7-4.5z" fill="currentColor"/></>),
  Pause:    wrap(<><rect x="4.5" y="3.5" width="2.5" height="9" rx="0.5" fill="currentColor"/><rect x="9" y="3.5" width="2.5" height="9" rx="0.5" fill="currentColor"/></>),
  Stop:     wrap(<><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/></>),
  Reload:   wrap(<><path d="M13 8a5 5 0 1 1-1.46-3.54"/><path d="M13 2v3h-3"/></>),
  Logs:     wrap(<><path d="M3 3.5h10M3 8h10M3 12.5h6"/></>),
  Activity: wrap(<><path d="M2 8h2.5L6 4l4 8 1.5-4H14"/></>),
  Ports:    wrap(<><circle cx="4" cy="8" r="1.5"/><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="12" r="1.5"/><path d="M5.4 7.2L10.6 4.8M5.4 8.8L10.6 11.2"/></>),
  Container: wrap(<><rect x="2.5" y="5" width="11" height="7" rx="1"/><path d="M5.5 5V3.5M10.5 5V3.5M2.5 8h11"/></>),
  History:  wrap(<><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></>),
  Settings: wrap(<><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5"/></>),
  Search:   wrap(<><circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4L13.5 13.5"/></>),
  Plus:     wrap(<><path d="M8 3.5v9M3.5 8h9"/></>),
  Minus:    wrap(<><path d="M3.5 8h9"/></>),
  Bell:     wrap(<><path d="M4 11V7.5a4 4 0 1 1 8 0V11l1 1.5H3L4 11z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></>),
  Cmd:      wrap(<><path d="M5.5 5.5h5v5h-5z"/><path d="M3.5 5.5a1.5 1.5 0 1 1 1.5 1.5"/><path d="M3.5 10.5a1.5 1.5 0 1 0 1.5-1.5"/><path d="M12.5 5.5a1.5 1.5 0 1 0-1.5 1.5"/><path d="M12.5 10.5a1.5 1.5 0 1 1-1.5-1.5"/></>),
  External: wrap(<><path d="M6.5 3.5H3.5v9h9v-3"/><path d="M9 3.5h3.5V7"/><path d="M7.5 8.5L12.5 3.5"/></>),
  Pin:      wrap(<><path d="M6.5 2.5h3l-.5 4 2 2-5 .5L4 12.5 5 9l-2-1.5L7 7l-.5-4.5z"/></>),
  Branch:   wrap(<><circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="6" r="1.5"/><path d="M4 5.5v5"/><path d="M5.4 5.2C6 7 8 7.5 10.6 6.4"/></>),
  Dot:      wrap(<><circle cx="8" cy="8" r="2.5" fill="currentColor"/></>),
  Chevron:  wrap(<><path d="M6 4l4 4-4 4"/></>),
  ChevronD: wrap(<><path d="M4 6l4 4 4-4"/></>),
  Filter:   wrap(<><path d="M2.5 4h11l-4 5v3.5L6.5 11V9l-4-5z"/></>),
  Wifi:     wrap(<><path d="M2 6.5a9 9 0 0 1 12 0"/><path d="M4 9a6 6 0 0 1 8 0"/><path d="M6 11.5a3 3 0 0 1 4 0"/><circle cx="8" cy="13.5" r="0.5" fill="currentColor"/></>),
  Clock:    wrap(<><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/></>),
  Check:    wrap(<><path d="M3 8.5l3 3 7-7"/></>),
  Close:    wrap(<><path d="M4 4l8 8M12 4l-8 8"/></>),
  Min:      wrap(<><path d="M3.5 12h9"/></>),
  Square:   wrap(<><rect x="3.5" y="3.5" width="9" height="9" rx="1"/></>),
  Restore:  wrap(<><rect x="5" y="3" width="8" height="8" rx="1"/><path d="M3 5v8a1 1 0 0 0 1 1h8"/></>),

  // Window controls. Kept separate from the glyphs above because they have to
  // agree with each other: all four are drawn inside the same box, centred on
  // (8, 8), so rendered at one size they share a stroke weight and optical
  // width. Reusing the general-purpose glyphs meant three different sizes and
  // therefore three different stroke weights sitting side by side.
  WinMin:     wrap(<><path d="M3 8h10"/></>),
  WinMax:     wrap(<><rect x="3.25" y="3.25" width="9.5" height="9.5" rx="0.5"/></>),
  WinRestore: wrap(<><rect x="5.5" y="2.5" width="8" height="8" rx="1"/><path d="M2.5 5.5v7a1 1 0 0 0 1 1h7"/></>),
  WinClose:   wrap(<><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></>),
  Db:       wrap(<><ellipse cx="8" cy="4" rx="5" ry="1.5"/><path d="M3 4v8c0 .8 2.2 1.5 5 1.5s5-.7 5-1.5V4"/><path d="M3 8c0 .8 2.2 1.5 5 1.5s5-.7 5-1.5"/></>),
  Globe:    wrap(<><circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11"/><path d="M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11"/></>),
  Cpu:      wrap(<><rect x="4" y="4" width="8" height="8" rx="1"/><rect x="6.5" y="6.5" width="3" height="3"/><path d="M6 2v2M10 2v2M6 12v2M10 12v2M2 6h2M2 10h2M12 6h2M12 10h2"/></>),
  Tunnel:   wrap(<><path d="M2.5 12V8a5.5 5.5 0 0 1 11 0v4"/><path d="M5 12V8a3 3 0 0 1 6 0v4"/></>)
};
