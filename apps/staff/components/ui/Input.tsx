import { forwardRef, useState } from "react";
import { View, Text, TextInput, type TextInputProps } from "react-native";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/cn";

interface Props extends TextInputProps {
  label?: string;
  helperText?: string;
  className?: string;
}

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, helperText, className, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="text-label-md font-medium text-text-secondary">{label}</Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={palette.tertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          "h-12 px-3 rounded-xl bg-surface-canvas border text-body-md text-text-primary",
          focused ? "border-border-focus" : "border-border-default",
          className,
        )}
        {...props}
      />
      {helperText ? (
        <Text className="text-caption text-text-tertiary">{helperText}</Text>
      ) : null}
    </View>
  );
});
