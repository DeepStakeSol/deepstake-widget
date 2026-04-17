import * as Tabs from "@radix-ui/react-tabs";
import { Card, Flex } from "@radix-ui/themes";
import { ReactNode } from "react";

interface StakeLayoutProps {
  /** content to render inside the "Your stake" tab */
  stakeChildren: ReactNode;
  /** content to render inside the "Manage" tab */
  manageChildren: ReactNode;
}

export function StakeLayout({ stakeChildren, manageChildren }: StakeLayoutProps) {
  return (
    <Card
      size="3"
      className="stake-form"
      style={{ padding: "25px 50px" }}
    >
      <Flex direction="column" gap="5">
        <Tabs.Root defaultValue="stake" style={{ width: "100%" }}>
          <Tabs.List
            style={{
              display: "flex",
              gap: 20,
              marginBottom: 20,
              paddingBottom: 10,
            }}
          >
            <Tabs.Trigger value="stake" className="tabs-level2">
              Your stake
            </Tabs.Trigger>
            <Tabs.Trigger value="manage" className="tabs-level2">
              Manage
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="stake">{stakeChildren}</Tabs.Content>
          <Tabs.Content value="manage">{manageChildren}</Tabs.Content>
        </Tabs.Root>
      </Flex>
      <style jsx>{`
        .stake-form {
          background-color: #fff;  
        }

        .tabs-level2 {
          font-size: 15px;
          padding: 8px 0;
          cursor: pointer;
          color: #C0C4CD;
          transition: color 0.2s ease, border-color 0.2s ease;
          border: 0;
          border-bottom: 2px solid #C0C4CD;
          width: 50%;
          height: 41px;
          background: #fff;
          text-align: left;
        }

        .tabs-level2[data-state="active"] {
          color: #000;
          font-size: 15px;
          font-weight: 600;
          border: 0;
          border-bottom: 2px solid #000;
          width: 50%;
          height: 41px;
          text-align: left;
        }

        #root[data-theme="dark"] .stake-form {
          background-color: #9f9fac29;
          color: #9F9FAC;
          border: 0;
        }

        #root[data-theme="dark"] .tabs-level2 {
          font-size: 15px;
          padding: 8px 0;
          cursor: pointer;
          color: #9F9FAC;
          transition: color 0.2s ease, border-color 0.2s ease;
          border: 0;
          border-bottom: 2px solid #9F9FAC;
          width: 50%;
          height: 41px;
          background-color: #31384600;
          text-align: left;
        }

        #root[data-theme="dark"] .tabs-level2[data-state="active"] {
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          border: 0;
          border-bottom: 2px solid #fff;
          width: 50%;
          height: 41px;
          text-align: left;
          background-color: #31384600;
        }

        .action-buttons-row {
          display: flex;
          justify-content: center;
          gap: 8px;
          width: 100%;
        }

        .action-buttons-row button {
          width: 50%;
        }
      `}</style>
    </Card>
  );
}
