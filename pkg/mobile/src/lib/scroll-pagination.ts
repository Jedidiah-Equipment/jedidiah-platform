export type VerticalScrollMetrics = {
  contentOffset: { y: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
};

export function isNearVerticalScrollEnd(metrics: VerticalScrollMetrics, threshold = 240): boolean {
  return metrics.contentSize.height - metrics.contentOffset.y - metrics.layoutMeasurement.height < threshold;
}
