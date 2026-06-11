import { IconMinus, IconPlus } from '@tabler/icons-react';
import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { getGanttCenteredDateFromScrollLeft, useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { BAY_SCHEDULE_ZOOM_DEFAULT, BAY_SCHEDULE_ZOOM_MAX, BAY_SCHEDULE_ZOOM_MIN } from './bay-schedule-view-store.js';

/** Wraps a zoom-store change so the visible timeline center survives the zoom. */
export type AnchoredZoomChange = (applyZoomChange: () => void) => void;

export const BayScheduleZoomControls: React.FC<{
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
}> = ({ onReset, onZoomIn, onZoomOut, zoom }) => (
  <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-card px-1 py-0.5">
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Zoom out"
            disabled={zoom <= BAY_SCHEDULE_ZOOM_MIN}
            onClick={onZoomOut}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconMinus />
      </TooltipTrigger>
      <TooltipContent>Zoom out</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`Reset zoom to ${BAY_SCHEDULE_ZOOM_DEFAULT}%`}
            className="w-14 tabular-nums"
            onClick={onReset}
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {zoom}%
      </TooltipTrigger>
      <TooltipContent>Reset zoom</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Zoom in"
            disabled={zoom >= BAY_SCHEDULE_ZOOM_MAX}
            onClick={onZoomIn}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconPlus />
      </TooltipTrigger>
      <TooltipContent>Zoom in</TooltipContent>
    </Tooltip>
  </div>
);

export const BayScheduleZoomAnchorController: React.FC<{
  onReady: (handler: AnchoredZoomChange | null) => void;
  zoom: number;
}> = ({ onReady, zoom }) => {
  const gantt = useGanttContext();
  const ganttRef = useRef(gantt);
  const lastZoomRef = useRef(zoom);
  const pendingAnchorDateRef = useRef<Date | null>(null);
  const scrollToDateRef = useRef(gantt.scrollToDate);

  useEffect(() => {
    ganttRef.current = gantt;
    scrollToDateRef.current = gantt.scrollToDate;
  }, [gantt]);

  const applyAnchoredZoomChange = useCallback<AnchoredZoomChange>((applyZoomChange) => {
    const currentGantt = ganttRef.current;
    const scrollElement = currentGantt.ref?.current;

    if (scrollElement) {
      pendingAnchorDateRef.current = getGanttCenteredDateFromScrollLeft(
        scrollElement.scrollLeft,
        currentGantt,
        scrollElement.clientWidth,
      );
    }

    applyZoomChange();
  }, []);

  useEffect(() => {
    onReady(applyAnchoredZoomChange);

    return () => onReady(null);
  }, [applyAnchoredZoomChange, onReady]);

  useEffect(() => {
    if (lastZoomRef.current === zoom) {
      return;
    }

    lastZoomRef.current = zoom;
    const anchorDate = pendingAnchorDateRef.current;
    if (!anchorDate) {
      return;
    }

    pendingAnchorDateRef.current = null;
    scrollToDateRef.current?.(anchorDate, 'auto', 'center');
  }, [zoom]);

  return null;
};
