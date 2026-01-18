import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMobileContextSafe } from '../../contexts/MobileContext';
import './BottomSheet.css';

export interface BottomSheetProps {
  /** Whether the bottom sheet is open */
  isOpen: boolean;
  /** Callback when the sheet should close */
  onClose: () => void;
  /** Content to render inside the sheet */
  children: ReactNode;
  /** Optional title for the sheet header */
  title?: string;
  /** Whether to show the drag handle indicator */
  showHandle?: boolean;
  /** Maximum height as percentage of viewport (default: 85) */
  maxHeightPercent?: number;
  /** Whether clicking backdrop should close the sheet */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape should close the sheet */
  closeOnEscape?: boolean;
  /** Additional CSS class for the sheet */
  className?: string;
  /** Test ID for automation */
  'data-testid'?: string;
}

/**
 * Mobile-optimized bottom sheet component
 * Renders as slide-up panel on mobile, centered modal on desktop
 */
export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  showHandle = true,
  maxHeightPercent = 85,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className = '',
  'data-testid': testId,
}: BottomSheetProps): JSX.Element | null {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mobileContext = useMobileContextSafe();
  const isMobile = mobileContext?.isMobile ?? false;
  const prefersReducedMotion = mobileContext?.prefersReducedMotion ?? false;

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const scrollY = window.scrollY;

    document.body.style.overflow = 'hidden';
    // Prevent iOS safari bounce
    if (isMobile) {
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      if (isMobile) {
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      }
    };
  }, [isOpen, isMobile]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;

    const sheet = sheetRef.current;
    const focusableElements = sheet.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Store previously focused element
    const previouslyFocused = document.activeElement as HTMLElement;

    // Focus first focusable element
    if (firstFocusable) {
      firstFocusable.focus();
    }

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    sheet.addEventListener('keydown', handleTab);

    return () => {
      sheet.removeEventListener('keydown', handleTab);
      // Restore focus when closing
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // Backdrop click handler
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (closeOnBackdropClick && event.target === event.currentTarget) {
        onClose();
      }
    },
    [closeOnBackdropClick, onClose]
  );

  // Touch handling for swipe-to-dismiss
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartY.current = event.touches[0].clientY;
    touchCurrentY.current = touchStartY.current;
    isDragging.current = true;
  }, [isMobile]);

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    if (!isDragging.current || !isMobile || !contentRef.current) return;

    touchCurrentY.current = event.touches[0].clientY;
    const deltaY = touchCurrentY.current - touchStartY.current;

    // Only allow dragging down
    if (deltaY > 0) {
      contentRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, [isMobile]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !isMobile || !contentRef.current) return;

    isDragging.current = false;
    const deltaY = touchCurrentY.current - touchStartY.current;

    // Close if dragged more than 100px down
    if (deltaY > 100) {
      onClose();
    }

    // Reset transform
    contentRef.current.style.transform = '';
  }, [isMobile, onClose]);

  if (!isOpen) return null;

  const sheetContent = (
    <div
      className={`bottom-sheet-overlay ${isOpen ? 'open' : ''} ${prefersReducedMotion ? 'reduced-motion' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'bottom-sheet-title' : undefined}
      data-testid={testId}
    >
      <div
        ref={sheetRef}
        className={`bottom-sheet ${isMobile ? 'mobile' : 'desktop'} ${className}`}
        style={{ maxHeight: `${maxHeightPercent}vh` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div ref={contentRef} className="bottom-sheet-content">
          {showHandle && isMobile && (
            <div className="bottom-sheet-handle">
              <div className="bottom-sheet-handle-bar" />
            </div>
          )}

          {title && (
            <div className="bottom-sheet-header">
              <h2 id="bottom-sheet-title" className="bottom-sheet-title">
                {title}
              </h2>
              <button
                type="button"
                className="bottom-sheet-close"
                onClick={onClose}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          )}

          <div className="bottom-sheet-body">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  // Render to portal for proper stacking
  return createPortal(sheetContent, document.body);
}
