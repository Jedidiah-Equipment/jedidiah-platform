import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StyledSvg } from '@/components/ui/svg';

const FADE_WIDTH = 28;

/** One edge's fade, from the surface colour at the edge to clear inward. */
function EdgeFade({ side, colorClassName }: { side: 'left' | 'right'; colorClassName: string }) {
  // Unique per row: on the web target svg ids are document-wide, and `useId`'s colons are not valid in `url(#…)`.
  const id = `fade-${side}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: FADE_WIDTH, [side]: 0 }}>
      <StyledSvg className={colorClassName} width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1={side === 'left' ? '0' : '1'} y1="0" x2={side === 'left' ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor="currentColor" stopOpacity={1} />
            <Stop offset="1" stopColor="currentColor" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </StyledSvg>
    </View>
  );
}

/**
 * A horizontal row that scrolls, fading each edge while more content waits past it. `fadeClassName` is the text
 * colour of whatever the row sits on (`text-surface` in a card, `text-background` on a page), so the fade melts into it.
 */
export function FadingScrollRow({
  children,
  gap = 8,
  fadeClassName = 'text-surface',
}: {
  children: ReactNode;
  gap?: number;
  fadeClassName?: string;
}) {
  const [width, setWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => setOffset(event.nativeEvent.contentOffset.x);
  const before = offset > 1;
  const after = offset + width < contentWidth - 1;
  return (
    <View>
      <ScrollView
        horizontal
        contentContainerStyle={{ gap }}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(contentW) => setContentWidth(contentW)}
      >
        {children}
      </ScrollView>
      {before ? <EdgeFade side="left" colorClassName={fadeClassName} /> : null}
      {after ? <EdgeFade side="right" colorClassName={fadeClassName} /> : null}
    </View>
  );
}
