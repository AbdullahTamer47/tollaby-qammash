import { useState } from 'react';

export default function Pagination({ totalItems, itemsPerPage, currentPage, onPageChange }) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const [jumpValue, setJumpValue] = useState('');

  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, currentPage + 2);

    if (currentPage <= 3) {
      end = Math.min(totalPages, 5);
    }
    if (currentPage >= totalPages - 2) {
      start = Math.max(1, totalPages - 4);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const handleJump = () => {
    const page = parseInt(jumpValue);
    if (Number.isInteger(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
    setJumpValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleJump();
    }
  };

  return (
    <div className="pagination" style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '0.5rem',
      marginTop: '1rem',
      flexWrap: 'wrap'
    }}>
      <button 
        className="btn btn-secondary btn-sm"
        disabled={currentPage === 1}
        onClick={() => onPageChange(1)}
      >
        <i className="pi pi-angle-double-right" /> الأول
      </button>

      <button 
        className="btn btn-secondary btn-sm"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <i className="pi pi-angle-right" /> السابق
      </button>

      {getPageNumbers().map(page => (
        <button
          key={page}
          className={`btn btn-sm ${page === currentPage ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onPageChange(page)}
          style={{ minWidth: '35px' }}
        >
          {page}
        </button>
      ))}

      <button 
        className="btn btn-secondary btn-sm"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        التالي <i className="pi pi-angle-left" />
      </button>

      <button 
        className="btn btn-secondary btn-sm"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(totalPages)}
      >
        الأخير <i className="pi pi-angle-double-left" />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginInlineStart: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)' }}>
          اذهب إلى:
        </span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={String(currentPage)}
          className="form-control form-control-sm"
          style={{ width: '60px', textAlign: 'center' }}
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleJump}
        >
          روح
        </button>
      </div>

      <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)' }}>
        إجمالي: {totalItems}
      </span>
    </div>
  );
}