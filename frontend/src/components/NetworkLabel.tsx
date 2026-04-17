import { Box, Text } from "@radix-ui/themes";
import { getNetworkIdentifier } from "../utils/config";

export function NetworkLabel() {
  const isDevnet = getNetworkIdentifier() === "devnet";
  return (
    <Box
      style={{
        //backgroundColor: "green",
        //borderBottom: "1px solid black",
        zIndex: 1,
        textAlign: "center",
        borderRadius: "15px",
      }}
      position="sticky"
      p="4"
      top="0"
      mb="-8"
    >
      {isDevnet && (
        <Text 
        style={{
          color: "red",
        }}
        //color="red" size="3" weight="bold"
        >
          Devnet
        </Text>
      )}
    </Box>
  );
}
