import { useState } from "react";
import { View, Text, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { X, Copy, Check } from "lucide-react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { haptics } from "@/lib/haptics";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

/** Copy / WhatsApp the patient self-check-in URL (Home + Queue share). */
export function ShareLinkSheet({
  visible,
  url,
  clinicName,
  onClose,
}: {
  visible: boolean;
  url: string;
  clinicName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await Clipboard.setStringAsync(url);
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleWhatsapp() {
    const msg = `Hi! Self-check into ${clinicName} here — fast, no app needed, you get a live token: ${url}`;
    void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <View className="flex-row items-start gap-3 mb-1">
          <View className="flex-1">
            <Text className="text-h3 font-bold text-text-primary">Share self-check-in</Text>
            <Text className="text-body-sm text-text-secondary mt-1 leading-relaxed">
              Patient fills the form on their own phone and gets a live token.
            </Text>
          </View>
          <PressableScale haptic="light" onPress={onClose} className="size-9 items-center justify-center rounded-full">
            <X size={18} color={palette.muted} />
          </PressableScale>
        </View>

        <View className="mt-5 flex-row items-center gap-2 bg-surface-raised border border-border-default rounded-lg px-3 py-2.5">
          <Text className="text-body-sm text-text-primary flex-1" numberOfLines={1}>
            {url.replace(/^https?:\/\//, "")}
          </Text>
          <PressableScale
            haptic={null}
            onPress={handleCopy}
            className={cn(
              "h-9 px-3 flex-row items-center gap-1.5 rounded-md",
              copied ? "bg-sage-100" : "bg-surface-canvas border border-border-default",
            )}
          >
            {copied ? <Check size={14} color={palette.sage} /> : <Copy size={14} color={palette.muted} />}
            <Text className={cn("text-label-sm font-semibold", copied ? "text-text-success" : "text-text-secondary")}>
              {copied ? "Copied" : "Copy"}
            </Text>
          </PressableScale>
        </View>

        <PressableScale
          haptic="light"
          onPress={handleWhatsapp}
          className="mt-3 h-12 flex-row items-center justify-center gap-2 rounded-xl bg-surface-brand"
        >
          <WhatsAppIcon size={18} color="#fff" />
          <Text className="text-label-lg font-semibold text-white">Send on WhatsApp</Text>
        </PressableScale>
      </View>
    </BottomSheet>
  );
}
