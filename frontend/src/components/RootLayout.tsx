import React from "react";
import "../globals.css";

import { SelectedWalletContextProvider } from "../context/SelectedWalletContextProvider";
import { BalanceCheckProvider } from "../context/BalanceCheckProvider";
import { StakingModalProvider } from "../context/StakingModalContext";
import { Section, Theme } from "@radix-ui/themes";
import { NetworkLabel } from "./NetworkLabel";
import { StakingModal } from "./StakingModal";
import { WalletModal } from "./WalletModal";
import "@radix-ui/themes/styles.css";

const RootLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
      <Theme
        className="sw-container"
        >
          <SelectedWalletContextProvider>
            <BalanceCheckProvider>
              <StakingModalProvider>
                <NetworkLabel />
                <Section style={{
                  flex: 1,
                  width: "640px"
                }}>{children}</Section>
                <StakingModal />
                <WalletModal />
              </StakingModalProvider>
            </BalanceCheckProvider>
          </SelectedWalletContextProvider>
          <style jsx global>{`
            .sw-container {
              position: relative;
              border-radius: 15px;
              background-color: #F2F1F1;
              border: 2px solid #CECED380;
            }

            #root[data-theme="dark"] > .sw-container {
              background-color: #0D1625;
              border-color: #9F9FAC40;
            }
          `}</style>
      </Theme>
  );
};

export default RootLayout;
