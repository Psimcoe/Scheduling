/**
 * MUI theme — MS Project–inspired colour palette.
 */

import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1B6B3A',   // Project-style dark green
      light: '#4CAF50',
      dark: '#0D4D2B',
    },
    secondary: {
      main: '#0078D4',   // MS blue
    },
    error: {
      main: '#D32F2F',
    },
    warning: {
      main: '#ED6C02',
    },
    background: {
      default: '#FAFAFA',
      paper: '#FFFFFF',
    },
    divider: '#E0E0E0',
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '2px 8px',
          fontSize: '0.8125rem',
          borderRight: '1px solid #E0E0E0',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: '36px !important',
        },
      },
    },
  },
});
