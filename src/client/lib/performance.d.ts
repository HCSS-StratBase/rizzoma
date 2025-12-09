export declare class PerformanceMonitor {
  private static metrics;
  static startTimer(label: string): () => number;
  static recordMetric(label: string, value: number): void;
  static getMetrics(): Record<string, any>;
  static logMetrics(): void;
}
export declare const measureRender: (componentName: string) => () => number;
