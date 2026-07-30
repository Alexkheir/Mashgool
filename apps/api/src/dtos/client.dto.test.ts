import { describe, it, expect } from 'vitest';
import { CreateClientDto, UpdateClientDto, CLIENT_COLORS } from './client.dto';

describe('CreateClientDto', () => {
  it('accepts a minimal valid client and trims the name', () => {
    const parsed = CreateClientDto.parse({ name: '  Brand Studio  ', shortCode: 'BS' });
    expect(parsed.name).toBe('Brand Studio');
    expect(parsed.shortCode).toBe('BS');
  });

  it('accepts an on-palette color', () => {
    const parsed = CreateClientDto.parse({
      name: 'X',
      shortCode: 'X1',
      color: CLIENT_COLORS[2]
    });
    expect(parsed.color).toBe(CLIENT_COLORS[2]);
  });

  it('rejects unknown fields (mass-assignment defence)', () => {
    const result = CreateClientDto.safeParse({
      name: 'X',
      shortCode: 'BS',
      isArchived: true
    });
    expect(result.success).toBe(false);
  });

  it('rejects a lowercase or over-length short code', () => {
    expect(CreateClientDto.safeParse({ name: 'X', shortCode: 'bs' }).success).toBe(false);
    expect(CreateClientDto.safeParse({ name: 'X', shortCode: 'TOOLONG' }).success).toBe(false);
    expect(CreateClientDto.safeParse({ name: 'X', shortCode: 'B' }).success).toBe(false);
  });

  it('rejects an off-palette color', () => {
    expect(
      CreateClientDto.safeParse({ name: 'X', shortCode: 'BS', color: '#000000' }).success
    ).toBe(false);
  });
});

describe('UpdateClientDto', () => {
  it('rejects any attempt to change the short code (immutability)', () => {
    const result = UpdateClientDto.safeParse({ shortCode: 'ZZ' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty patch', () => {
    expect(UpdateClientDto.safeParse({}).success).toBe(false);
  });

  it('allows clearing the description with null', () => {
    const parsed = UpdateClientDto.parse({ description: null });
    expect(parsed.description).toBeNull();
  });
});
