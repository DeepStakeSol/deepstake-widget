import { Table, Flex } from "@radix-ui/themes";
import { useEffect } from "react";
import './table.css'

interface BSOLBalanceTableProps {
  bSOLBalance: number;
  isLoading: boolean;
}

export function BSOLBalanceTable({ 
  bSOLBalance, 
  isLoading, 
}: BSOLBalanceTableProps) {
  
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      #stake-table-container table {
        width: 100%;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

    return (
      <>
      <div className="table-wrapper">
      <Flex
        id="stake-table-container"
        direction="column"
        gap="1"
        style={{
          fontSize: "11.5px",
          color: "#222",
          lineHeight: "1.1",
          width: "100%", // ✅ ensures the whole layout fits parent width
        }}
      > 
        <Table.Root
          variant="surface"
          style={{
            width: "100%", // ✅ ensures table stretches across parent
            borderCollapse: "separate",
            borderSpacing: 0,
            border: "1px solid #ccc",
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "#fff",
            fontSize: "11.5px",
            lineHeight: "1.1",
          }}
        >
          <Table.Body>
            
              <Table.Row
                className={`cursor-pointer`}  
              >
                <Table.Cell
                  style={{
                    textAlign: "center",
                    padding: "4px 6px",
                    borderRight: "1px solid #f1f1f1",
                  }}
                >
                  Your bSOL's total:
                </Table.Cell>

                <Table.Cell
                  style={{
                    textAlign: "center",
                    padding: "4px 6px",
                    borderRight: "1px solid #f1f1f1",
                    color: isLoading ? "#f83636ff" : "#222",
                  }}
                >
                  {isLoading ? (
                    <>
                      updating...
                      <div className="spinner" />
                    </>
                  ) : (
                    bSOLBalance
                  )}
                </Table.Cell>
            
              </Table.Row>
          </Table.Body>
        </Table.Root>
      </Flex>


      <style jsx global>{`
        .table-wrapper {
          position: relative;
        }

        .table-wrapper table {
          width: 100%;
          transition: filter 0.2s ease;
        }

        .table-wrapper table.loading {
          filter: grayscale(1) brightness(0.8);
          pointer-events: none;
        }

        /* spinner */
        .spinner {
          float: right;
          width: 9px;
          height: 9px;
          border: 1px solid #ccc;
          border-top-color: #fc0101ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
      </div>
      </>
   
 );
}
