// Shared inline style objects to reduce duplication across components.
// Keeping values inline per instructions, but centralizing repeat patterns.

export const centerFlex = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const centerFlexColumn = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  textAlign: "center" as const,
};

export const dialogContentBase = {
  background: "#f0f0f0",
  position: "relative" as const,
  zIndex: 10,
  padding: 0,
};

// common margin utilities
export const mt8 = { marginTop: "8px" };
export const mt30 = { marginTop: "30px" };
export const mt70 = { marginTop: "70px" };

// gap helpers
export const gap8 = { gap: "8px" };
export const gap24 = { gap: "24px" };
