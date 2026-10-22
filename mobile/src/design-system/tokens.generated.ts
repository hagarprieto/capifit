// GERADO por scripts/generate-theme.js a partir de docs/08_design_tokens.json (v0.2.0).
// Não edite à mão: altere o JSON e rode `npm run tokens`.
export const tokens = {
  "version": "0.2.0",
  "color": {
    "dark": {
      "bg": {
        "primary": "#0D1117",
        "surface": "#171D26",
        "elevated": "#222B36"
      },
      "brand": {
        "primary": "#94F047",
        "onPrimary": "#0D1117",
        "dark": "#447A20",
        "text": "#94F047"
      },
      "text": {
        "primary": "#F6F8FA",
        "secondary": "#B5BECA",
        "disabled": "#7C8795"
      },
      "feedback": {
        "error": "#FF7777",
        "warning": "#FFD166",
        "success": "#8CE5B0",
        "info": "#7CB7FF"
      },
      "border": {
        "subtle": "#35404D",
        "strong": "#6B7889"
      },
      "focus": {
        "ring": "#FFFFFF"
      },
      "origin": {
        "usuario": "#8CE5B0",
        "coach": "#7CB7FF",
        "app": "#C4A6FF"
      }
    },
    "light": {
      "bg": {
        "primary": "#F6F8FA",
        "surface": "#FFFFFF",
        "elevated": "#EEF1F5"
      },
      "brand": {
        "primary": "#94F047",
        "onPrimary": "#0D1117",
        "text": "#2E6414",
        "dark": "#447A20"
      },
      "text": {
        "primary": "#0D1117",
        "secondary": "#4A5565",
        "disabled": "#6F7A89"
      },
      "feedback": {
        "error": "#B42318",
        "warning": "#8A5A00",
        "success": "#17653A",
        "info": "#1F5FBF"
      },
      "border": {
        "subtle": "#D0D7DE",
        "strong": "#6B7889"
      },
      "focus": {
        "ring": "#0D1117"
      },
      "origin": {
        "usuario": "#17653A",
        "coach": "#1F5FBF",
        "app": "#6B3FD0"
      }
    }
  },
  "typography": {
    "family": "Inter",
    "fallback": "system-ui",
    "features": [
      "tnum"
    ],
    "scale": {
      "caption": {
        "size": 12,
        "line": 16,
        "weight": 500
      },
      "bodySmall": {
        "size": 14,
        "line": 20,
        "weight": 400
      },
      "body": {
        "size": 16,
        "line": 24,
        "weight": 400
      },
      "bodyStrong": {
        "size": 16,
        "line": 24,
        "weight": 600
      },
      "title": {
        "size": 20,
        "line": 28,
        "weight": 600
      },
      "headline": {
        "size": 24,
        "line": 32,
        "weight": 700
      },
      "display": {
        "size": 32,
        "line": 40,
        "weight": 700
      },
      "numeric": {
        "size": 24,
        "line": 32,
        "weight": 700
      }
    },
    "maxFontScale": 2
  },
  "space": [
    4,
    8,
    12,
    16,
    24,
    32
  ],
  "radius": {
    "sm": 8,
    "md": 12,
    "lg": 16,
    "xl": 24,
    "pill": 999
  },
  "size": {
    "touchMin": {
      "ios": 44,
      "android": 48
    },
    "touchPreferred": 56,
    "setRow": {
      "height": 64
    },
    "setField": {
      "width": 80
    },
    "icon": [
      20,
      24,
      32
    ],
    "avatar": {
      "capi": [
        32,
        40,
        56
      ]
    },
    "tabBar": {
      "height": 64
    }
  },
  "motion": {
    "duration": {
      "instant": 0,
      "fast": 120,
      "base": 200,
      "slow": 320
    },
    "easing": {
      "standard": "cubic-bezier(0.2, 0, 0, 1)",
      "exit": "cubic-bezier(0.4, 0, 1, 1)"
    }
  }
} as const;
