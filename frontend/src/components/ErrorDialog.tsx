import { Text, Button, Flex } from '@radix-ui/themes'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { getErrorMessage } from '../utils/errors'
import { ExclamationTriangleIcon } from '@radix-ui/react-icons'

type Props = Readonly<{
  error: unknown
  onClose?(): false | void
  title?: string
}>

export function ErrorDialog({ error, onClose, title }: Props) {
  const [isOpen, setIsOpen] = useState(true)

  const handleClose = () => {
    if (!onClose || onClose() !== false) {
      setIsOpen(false)
    }
  }

  if (!isOpen) {
    return null
  }

  const dialogTitle = title ?? 'Staking failed'
  const widgetRoot =
    typeof document === 'undefined' ? null : document.querySelector('.sw-container')

  const dialog = (
    <>
      <div className="error-dialog-overlay" role="presentation" aria-hidden="true" />
      <div
        className="error-dialog-content"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-dialog-title"
        aria-describedby="error-dialog-description"
      >
        <Flex direction="column" gap="4">
          {/* Error Icon and Title */}
          <Flex direction="column" gap="3" style={{ textAlign: 'center' }}>
            <div style={{ margin: '0 auto', position: 'relative' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(255, 86, 86, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                }}
              >
                <ExclamationTriangleIcon width={24} height={24} color="#FF5656" />
              </div>
            </div>
            <div id="error-dialog-title">
              <Text
                size="6"
                weight="bold"
                style={{
                  color: '#FF5656',
                  fontSize: '20px',
                }}
              >
                {dialogTitle}
              </Text>
            </div>
          </Flex>

          {/* Error Message */}
          <div
            id="error-dialog-description"
            style={{
              display: 'flex',
              justifyContent: 'center',
              textAlign: 'center',
              width: '100%',
            }}
          >
            <Text
              size="3"
              style={{
                color: '#999999',
                display: 'block',
                textAlign: 'center',
                margin: '0 auto',
                maxWidth: '320px',
                lineHeight: '1.5',
              }}
            >
              {getErrorMessage(error, 'An unexpected error occurred')}
            </Text>
          </div>

          {/* Action Button */}
          <Flex
            mt="4"
            justify="center"
            style={{
              display: 'flex',
              marginTop: '20px',
              justifyContent: 'center',
            }}
          >
            <Button
              size="3"
              className="error-close-button"
              onClick={handleClose}
              style={{
                background: '#242424',
                color: 'white',
                cursor: 'pointer',
                padding: '20px 32px',
                borderRadius: '12px',
                border: '1px solid #2C2C2C',
                transition: 'all 0.2s ease',
                fontWeight: '500',
                minWidth: '120px',
              }}
            >
              Close
            </Button>
          </Flex>
        </Flex>
      </div>

      <style>{`
        .error-dialog-overlay {
          position: absolute;
          inset: 0;
          z-index: 100;
          background-color: #9f9facc4;
          backdrop-filter: blur(4px);
          border-radius: 20px;
        }

        .error-dialog-content {
          position: absolute;
          z-index: 101;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(400px, calc(100% - 32px));
          box-sizing: border-box;
          background: #f0f0f0;
          border: 1px solid #9e9e9dff;
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          color: #000;
          padding: 24px;
        }

        [data-widget="deepstake"][data-theme="dark"] .error-dialog-overlay {
          background-color: #0d1625db;
          backdrop-filter: blur(4px);
        }

        [data-widget="deepstake"][data-theme="dark"] .error-dialog-content {
          background-color: #353844;
          border-color: #9f9fac40;
          color: #fff;
        }
      `}</style>
    </>
  )

  return widgetRoot ? createPortal(dialog, widgetRoot) : dialog
}
