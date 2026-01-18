// Performance monitoring utilities
export class PerformanceMonitor {
  private static metrics = new Map<string, number[]>();
  
  static startTimer(label: string): () => number {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.recordMetric(label, duration);
      return duration;
    };
  }
  
  static recordMetric(label: string, value: number) {
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)!.push(value);
    
    // Keep only last 100 measurements
    const values = this.metrics.get(label)!;
    if (values.length > 100) {
      values.shift();
    }
  }
  
  static getMetrics() {
    const summary: Record<string, any> = {};
    for (const [label, values] of this.metrics) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      summary[label] = {
        count: values.length,
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)],
      };
    }
    return summary;
  }
  
  static logMetrics() {
    console.table(this.getMetrics());
  }
}

// Usage in components:
export const measureRender = (componentName: string) => {
  return PerformanceMonitor.startTimer(`render:${componentName}`);
};

// Global performance monitoring
if (typeof window !== 'undefined') {
  // Log metrics every 30 seconds in dev
  if (process.env['NODE_ENV'] === 'development') {
    setInterval(() => PerformanceMonitor.logMetrics(), 30000);
  }
}
