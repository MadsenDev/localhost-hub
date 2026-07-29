import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortConflictDialog } from '../port-conflict-dialog';

describe('PortConflictDialog', () => {
  it('shows owner details and returns the selected recovery action', () => {
    const onDecide = vi.fn();
    render(
      <PortConflictDialog
        conflicts={[{
          port: 5173,
          pid: 21842,
          process_name: 'node',
          protocol: 'tcp',
          bind_address: '127.0.0.1',
          url: 'http://localhost:5173',
        }]}
        onDecide={onDecide}
      />,
    );

    expect(screen.getByText(':5173')).toBeInTheDocument();
    expect(screen.getByText('node · PID 21842')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Stop owner & retry/ }));
    expect(onDecide).toHaveBeenCalledWith('terminate');
  });

  it('disables termination when the operating system did not expose a PID', () => {
    render(
      <PortConflictDialog
        conflicts={[{
          port: 8080,
          pid: null,
          process_name: null,
          protocol: 'tcp',
          bind_address: '0.0.0.0',
          url: 'http://localhost:8080',
        }]}
        onDecide={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Stop owners? & retry/ })).toBeDisabled();
  });
});
