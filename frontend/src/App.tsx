"use client";
import { useState, useEffect } from "react";
import { Card, Flex } from "@radix-ui/themes";
import * as Tabs from "@radix-ui/react-tabs";
import { StakeForm } from "./components/stake/StakeForm";
import { StakeFormBlaze } from "./components/stake/StakeFormBlaze";
import RootLayout from "./components/RootLayout";
import './App.css';
import { StakeFormVault2 } from "./components/stake/StakeFormVault2";
import { TitleHeader } from "./components/TitleHeader";
import { ValidatorInfo } from "./components/stake/ValidatorInfo";
import { fetchValidatorInfo, ValidatorInfoResponse, fetchValidatorLogo } from "./utils/solana/validator";
import { fetchEpochInfo, fetchPerfSamples } from "./utils/api";
import { useNetwork } from "./context/NetworkContext";


function App() {

  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [secondsRemainToEpochEnd, setSecondsRemainToEpochEnd] = useState<number>(0);
  const [validatorInfo, setValidatorInfo] = useState<ValidatorInfoResponse | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { network } = useNetwork();

  useEffect(() => {
      const fetchValidatorData = async () => {
        try {
          const data = await fetchValidatorInfo();
          setValidatorInfo(data);
        } catch (error) {
          console.error("Failed to fetch validator_info:", error);
        }
      };
      fetchValidatorData();

      const fetchLogo = async () => {
        try {
          const logo = await fetchValidatorLogo();
          setLogoUrl(logo);
        } catch (error) {
          console.error("Failed to fetch validator_logo:", error);
        }
      };
      fetchLogo();

      // Fetch epoch info from backend
      fetchEpochInfo(network)
        .then((data) => {
          setCurrentEpoch(Number(data.epochInfo?.epoch) || 0);

          const slotIndex = data.epochInfo?.slotIndex || 0;
          const slotsInEpoch = data.epochInfo?.slotsInEpoch || 1;

          const progress = (slotIndex / slotsInEpoch) * 100;
          const slotsLeft = slotsInEpoch - slotIndex;

          setCurrentProgress(Math.round(progress));

          // Fetch perf samples
          return fetchPerfSamples(network).then((perf) => {
            const sample = perf.sample;
            const avgSlotTime =
              sample.numSlots > 0
                ? sample.samplePeriodSecs / sample.numSlots
                : 0;
            setSecondsRemainToEpochEnd(avgSlotTime * slotsLeft);
          });
        })
        .catch((error) =>
          console.error("Failed to fetch epoch/perf data:", error)
        );
      }, [network]);
  
  return (
    <>
    <RootLayout>
      <Flex
        direction="column"
        align="center"
        justify="center"
        style={{
          padding: "25px",
        }}
      >
        <TitleHeader 
          progress={currentProgress}
          currentEpoch={currentEpoch}
          secondsRemainToEpochEnd={secondsRemainToEpochEnd}
        />

        {/* Validator Info */}
        { <ValidatorInfo
          validatorInfo={validatorInfo}
          logoUrl={logoUrl}
        /> }

        
          <Tabs.Root defaultValue="stake" style={{ width: "100%" }}>
            <Card
              size="3"
              className="sw-main-tabs"
              style={{ width: "100%", padding: "7px", marginBottom: "10px" }}
            >
              <Tabs.List
                style={{
                  display: "flex",
                  gap: 7,
                }}
              >
                <Tabs.Trigger
                  value="stake"
                  className="tabs-trigger tab-native"
                >
                  Native <br/>
                  staking
                </Tabs.Trigger>

                <Tabs.Trigger
                  value="stake2"
                  className="tabs-trigger tab-blaze"
                >
                  Direct staking <br/>
                  BlazeStake
                </Tabs.Trigger>

                <Tabs.Trigger
                  value="stake3"
                  className="tabs-trigger tab-vault"
                >
                  Direct staking <br/>
                  Vault
                </Tabs.Trigger>
              </Tabs.List>
            </Card>

            <Tabs.Content value="stake">
              <StakeForm 
                currentEpoch={currentEpoch}
                validatorInfo={validatorInfo}
                secondsRemainToEpochEnd={secondsRemainToEpochEnd}
              />

            </Tabs.Content>

            <Tabs.Content value="stake2">
              <StakeFormBlaze 
                validatorInfo={validatorInfo}
                secondsRemainToEpochEnd={secondsRemainToEpochEnd}
              />
            </Tabs.Content>

            <Tabs.Content value="stake3">
              <StakeFormVault2
                validatorInfo={validatorInfo}
                secondsRemainToEpochEnd={secondsRemainToEpochEnd}
              />
            </Tabs.Content>
          </Tabs.Root>
      </Flex>
    </RootLayout>

    <style jsx global>{`
        #root .sw-main-tabs {
          color: #000000;
          background: #fff;
        }

        #root[data-theme="dark"] .sw-main-tabs {
          color: #9F9FAC;
          background-color: #9f9fac66;
          border: 0;
        }
        
        .tabs-trigger {
          font-weight: 600;
          font-size: 14px;
          padding: 8px 16px;
          cursor: pointer;
          color: #000000;
          transition: color 0.2s ease, border-color 0.2s ease;
          background-color: #fff;
          background-size: cover;
          border: 0;
          border-radius: 10px;
          width: 190px;
          height: 64px;
        }

        .tabs-trigger[data-state="active"] {
          color: #FFFFFF;
          font-weight: 700;
          font-size: 14px;
          background-color: #fff;
          background-size: cover;
          border: 0;
          width: 190px;
          height: 64px;
        }

        .tabs-trigger.tab-native {
          background-image: url(/images/native_stake.png);
        }
        .tabs-trigger.tab-native[data-state="active"] {
          background-image: url(/images/native_stake_selected.png);
        }

        .tabs-trigger.tab-blaze {
          background-image: url(/images/blaze_stake.png);
        }
        .tabs-trigger.tab-blaze[data-state="active"] {
          background-image: url(/images/blaze_stake_selected.png);
        }

        .tabs-trigger.tab-vault {
          background-image: url(/images/vault_stake.png);
        }
        .tabs-trigger.tab-vault[data-state="active"] {
          background-image: url(/images/vault_stake_selected.png);
        }
        
        #root[data-theme="dark"] .tabs-trigger {
          background-color: #9f9fac00;
          color: #9F9FAC;
        }

        #root[data-theme="dark"] .tabs-trigger[data-state="active"] {
          background-color: #9f9fac00;
          color: #000;
        }

        #root[data-theme="dark"] .tab-native {
          background-image: url(/images/native_stake_dk.png);
        }
        #root[data-theme="dark"] .tab-native[data-state="active"] {
          background-image: url(/images/native_stake_selected_dk.png);
        }

        #root[data-theme="dark"] .tab-blaze {
          background-image: url(/images/blaze_stake_dk.png);
        }
        #root[data-theme="dark"] .tab-blaze[data-state="active"] {
          background-image: url(/images/blaze_stake_selected_dk.png);
        }

        #root[data-theme="dark"] .tab-vault {
          background-image: url(/images/vault_stake_dk.png);
        }
        #root[data-theme="dark"] .tab-vault[data-state="active"] {
          background-image: url(/images/vault_stake_selected_dk.png);
        }

        .rt-BaseDialogContent {
            margin: auto;
            width: 100%;
            z-index: 1;
            position: relative;
            overflow: auto;
            --inset-padding-top: calc(24px * 1);
            --inset-padding-right: calc(24px * 1);
            --inset-padding-bottom: calc(24px * 1);
            --inset-padding-left: calc(24px * 1);
            padding: calc(24px * 1);
            box-sizing: border-box;
            background-color: #191918;
            box-shadow: 0 0 0 1px color-mix(in oklab, #fffaed2d, #3b3a37 25%), 0 12px 60px rgba(0, 0, 0, 0.2), 0 16px 64px rgba(0, 0, 0, 0.4), 0 16px 36px -20px rgba(0, 0, 0, 0.9);
            outline: none;
        }

        .rt-Separator:where(.rt-r-size-4) {
            --separator-size: 100%;
        }

        .rt-Separator:where(.rt-r-orientation-horizontal) {
            width: 100%;
            height: 1px;
        }

        .rt-Separator {
            display: block;
            background-color: #d9d7d1;
        }

        .rt-Card:where(.rt-variant-surface) {
            --card-border-width: 1px;
            --card-background-color: #d9d7d1;
        }
        .rt-Card:where(.rt-r-size-1) {
            --card-padding: calc(12px * 1);
            --card-border-radius: calc(8px * 1 * 1);
        }

        .rt-Card {
            --base-card-padding-top: calc(8px * 1 * 1);
            --base-card-padding-right: calc(12px * 1);
            --base-card-padding-bottom: calc(12px * 1);
            --base-card-padding-left: calc(12px * 1);
            --base-card-border-radius: calc(8px * 1 * 1);
            --base-card-border-width: 1px;
        }
        .rt-BaseCard {
            display: block;
            position: relative;
            overflow: hidden;
            border-radius: calc(8px * 1 * 1);
            border: 1px solid #d9d7d1;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI (Custom)', Roboto, 'Helvetica Neue', 'Open Sans (Custom)', system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
            font-weight: 400;
            font-size: 13px;
            font-style: normal;
            text-align: start;
            --inset-border-width: 1px;
            --inset-border-radius: calc(8px * 1 * 1);
            padding-top: calc(12px * 1);
            padding-right: calc(12px * 1);
            padding-bottom: calc(12px * 1);
            padding-left: calc(12px * 1);
            box-sizing: border-box;
            --inset-padding-top: calc(calc(12px * 1) - 1px);
            --inset-padding-right: calc(calc(12px * 1) - 1px);
            --inset-padding-bottom: calc(calc(12px * 1) - 1px);
            --inset-padding-left: calc(calc(12px * 1) - 1px);
            contain: paint;
        }

        @keyframes  spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
        }
        @keyframes pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(0, 159, 209, 0.4);
            }
            70% {
              box-shadow: 0 0 0 10px rgba(0, 159, 209, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(0, 159, 209, 0);
            }
        }
      `}</style>
    </>
  )
}

export default App