/**
 * MSPDI duration converter tests.
 */

import { describe, it, expect } from 'vitest';
import {
  durationToMinutes,
  minutesToDuration,
  lagFromMspdi,
  lagToMspdi,
} from './durationConverter.js';

describe('durationConverter', () => {
  describe('durationToMinutes', () => {
    it('PT8H0M0S = 480', () => {
      expect(durationToMinutes('PT8H0M0S')).toBe(480);
    });

    it('PT0H0M0S = 0', () => {
      expect(durationToMinutes('PT0H0M0S')).toBe(0);
    });

    it('PT1H30M0S = 90', () => {
      expect(durationToMinutes('PT1H30M0S')).toBe(90);
    });

    it('PT480H0M0S = 28800 (60 days of hours)', () => {
      expect(durationToMinutes('PT480H0M0S')).toBe(28800);
    });

    it('P1D = 1440 (raw 24h day)', () => {
      expect(durationToMinutes('P1D')).toBe(1440);
    });

    it('empty string = 0', () => {
      expect(durationToMinutes('')).toBe(0);
    });

    it('P1DT8H0M0S = 1920 (1 day + 8h)', () => {
      expect(durationToMinutes('P1DT8H0M0S')).toBe(1440 + 480);
    });
  });

  describe('minutesToDuration', () => {
    it('480 → PT8H0M0S', () => {
      expect(minutesToDuration(480)).toBe('PT8H0M0S');
    });

    it('0 → PT0H0M0S', () => {
      expect(minutesToDuration(0)).toBe('PT0H0M0S');
    });

    it('90 → PT1H30M0S', () => {
      expect(minutesToDuration(90)).toBe('PT1H30M0S');
    });
  });

  describe('lagFromMspdi / lagToMspdi', () => {
    it('4800 tenths = 480 minutes', () => {
      expect(lagFromMspdi(4800)).toBe(480);
    });

    it('0 tenths = 0 minutes', () => {
      expect(lagFromMspdi(0)).toBe(0);
    });

    it('480 minutes = 4800 tenths', () => {
      expect(lagToMspdi(480)).toBe(4800);
    });

    it('round-trip: lagToMspdi(lagFromMspdi(x)) = x', () => {
      expect(lagToMspdi(lagFromMspdi(4800))).toBe(4800);
    });
  });
});
