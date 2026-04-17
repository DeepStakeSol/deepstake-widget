import {
  Dialog,
  Flex,
  Text
} from "@radix-ui/themes";
import {
  centerFlex,
  centerFlexColumn,
  dialogContentBase,
  mt30,
  mt70,
  gap24,
} from "../../utils/styles";
import {
  getExplorerTxUrl
} from "../../utils/config";

interface StakeBlazeSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  signature?: string;
}

export function StakeBlazeSuccessModal({
  isOpen,
  onClose,
  signature
}: StakeBlazeSuccessModalProps) {
  return (
    
      <Dialog.Root 
        open={isOpen} onOpenChange={(open) => !open && onClose()}
      >
      
        {/* Dialog Content */}
        <Dialog.Content
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{
            ...dialogContentBase,
            width: "400px",
            height: "410px",
          }}
        >
          <Flex direction="column" gap="5">
            {/* Loading Header */}
            <Flex 
              direction="column" 
              gap="2" 
              style={{
                ...centerFlexColumn,
              }}
            >
              <Dialog.Title
                style={{
                  color: "#000",
                  fontSize: "20px",
                  fontWeight: 600,
                  ...mt70,
                  marginBottom: 0,
                }}
              >
                Congratulations!
              </Dialog.Title>

              <img 
                    src="/images/staking_sol_logo.png" 
                    alt="staking logo" 
                    width={130}
                    height={117}
                    style={{
                      ...mt30,
                    }}
                  />
              
              <div 
                style={{
                  ...mt30,
                  width: "200px",
                }}
              >
                <Text size="2" color="gray" style={{
                    ...mt30,
                    fontSize: "13px",
                    fontWeight: 400,
                  }}>
                  Your Blaze Stake has been activated and has started to earn rewards!
                </Text>
              </div>

              {/* View Options */}
              { signature && (
                <Flex
                  gap="3"
                  justify="between"
                  style={{
                    ...centerFlex,
                    ...gap24,
                    ...mt30,
                  }}
                >
                  <a
                    href={getExplorerTxUrl({
                          signature: signature,
                          explorer: "solana-explorer"
                        })}
                    className="sol-links"
                  >
                    Explorer
                  </a>
                  <a
                    href={getExplorerTxUrl({
                          signature: signature,
                          explorer: "solscan"
                        })}
                    className="sol-links"
                  >
                    Solscan
                  </a>

                  <a
                    href={getExplorerTxUrl({
                          signature: signature,
                          explorer: "solana-fm"
                        })}
                    className="sol-links"
                  >
                    Solana FM
                  </a>
                </Flex>
              )}
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
  );
}
