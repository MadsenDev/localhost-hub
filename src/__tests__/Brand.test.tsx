import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnimatedHubLockup } from '../brand';

describe('AnimatedHubLockup', () => {
  it('renders the complete accessible lockup without an external animation runtime', () => {
    const { container } = render(
      <AnimatedHubLockup markSize={80} accent="#0066ff" body="#ffffff" />,
    );

    const lockup = screen.getByLabelText('Localhost Hub');
    expect(lockup).toHaveStyle({
      '--hub-mark-size': '80px',
      '--hub-accent': '#0066ff',
      '--hub-body': '#ffffff',
    });
    expect(container.querySelectorAll('.hub-lockup-node')).toHaveLength(4);
    expect(container.querySelectorAll('.hub-lockup-link')).toHaveLength(4);
    expect(container.querySelectorAll('.hub-lockup-signal')).toHaveLength(4);
    expect(container.querySelectorAll('.hub-lockup-letter')).toHaveLength(12);
  });
});
