import { forwardRef, memo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

// Use forwardRef to avoid React warning when parent tries to pass ref
export const PaginationControls = memo(forwardRef<HTMLDivElement, PaginationControlsProps>(
  function PaginationControls({
    currentPage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    onPageChange,
    isLoading = false,
  }, ref) {
    if (totalPages <= 1) return null;

    return (
      <div ref={ref} className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-4 bg-muted/30 rounded-lg border">
        {/* Info */}
        <div className="text-sm text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{startIndex}</span> a{' '}
          <span className="font-medium text-foreground">{endIndex}</span> de{' '}
          <span className="font-medium text-foreground">{totalItems}</span> itens
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1 || isLoading}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page numbers */}
          <div className="flex items-center gap-1 mx-2">
            {generatePageNumbers(currentPage, totalPages).map((page, index) => (
              page === '...' ? (
                <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                  ...
                </span>
              ) : (
                <Button
                  key={page}
                  variant={page === currentPage ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onPageChange(page as number)}
                  disabled={isLoading}
                >
                  {page}
                </Button>
              )
            ))}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages || isLoading}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
));

function generatePageNumbers(current: number, total: number): (number | string)[] {
  const pages: (number | string)[] = [];
  const maxVisible = 5;

  if (total <= maxVisible) {
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    if (current > 3) {
      pages.push('...');
    }

    // Show pages around current
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }

    if (current < total - 2) {
      pages.push('...');
    }

    // Always show last page
    if (!pages.includes(total)) {
      pages.push(total);
    }
  }

  return pages;
}

export default PaginationControls;
