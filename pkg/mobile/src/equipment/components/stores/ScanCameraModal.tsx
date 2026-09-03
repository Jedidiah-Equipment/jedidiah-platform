import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';

/**
 * The camera fallback for when the wedge cannot read a label (spec §10) — a scuffed bin tag, a
 * scanner with a flat battery. Not the everyday path, which is why the permission is only asked for
 * the first time somebody opens this.
 *
 * Code 128 only, matching what we print. Accepting every symbology the camera can decode would let
 * a supplier's own barcode resolve here, and supplier barcodes are trusted for nothing (spec §10).
 */
export function ScanCameraModal({
  onClose,
  onScanned,
  open,
}: {
  onClose: () => void;
  onScanned: (raw: string) => void;
  open: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  // The camera fires repeatedly while a barcode is in frame; one open sheet may only yield one scan.
  const hasScanned = useRef(false);

  // Armed per opening, not per mount: the sheet stays mounted between scans, so a latch that is
  // only cleared on cancel would make the second camera scan of a shift silently do nothing.
  useEffect(() => {
    if (open) hasScanned.current = false;
  }, [open]);

  return (
    <ThemedModal backdropLabel="Close the camera" onClose={onClose} open={open}>
      <View className="w-full max-w-[560px] gap-4 rounded-2xl border border-border bg-surface p-5">
        <Text className="text-xl text-surface-foreground" weight="bold">
          Scan with the camera
        </Text>

        {permission?.granted !== true ? (
          <View className="gap-3 py-4">
            <Text className="text-sm text-muted-foreground">
              {permission?.canAskAgain === false
                ? 'Camera access is turned off for this app. Enable it in the tablet’s settings, or type the Part code instead.'
                : 'The camera needs permission before it can read a label.'}
            </Text>
            {permission?.canAskAgain === false ? null : (
              <Pressable
                accessibilityRole="button"
                className="items-center rounded-xl bg-primary px-4 py-3"
                onPress={() => void requestPermission()}
              >
                <Text className="text-sm text-primary-foreground" weight="semibold">
                  Allow camera
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View className="h-64 overflow-hidden rounded-xl bg-image-backdrop">
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['code128'] }}
              onBarcodeScanned={({ data }) => {
                if (hasScanned.current) return;
                hasScanned.current = true;
                onScanned(data);
              }}
              style={{ flex: 1 }}
            />
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          className="items-center rounded-xl border border-border px-4 py-3"
          onPress={onClose}
        >
          <Text className="text-sm text-surface-foreground" weight="semibold">
            Cancel
          </Text>
        </Pressable>
      </View>
    </ThemedModal>
  );
}
