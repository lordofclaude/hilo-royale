/* iOS large-title screen header — SF Pro Display bold 34pt (system font),
   optional tracked caption above and a right-side accessory slot.
   Brand/hero screens keep BrandHeader; tab screens use this. */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { type } from "../theme";

interface Props {
  title: string;
  caption?: string;
  right?: React.ReactNode;
}

export default function ScreenHeader({ title, caption, right }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.textCol}>
        {!!caption && <Text style={styles.caption}>{caption}</Text>}
        <Text style={styles.title} numberOfLines={1} allowFontScaling>
          {title}
        </Text>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4, marginBottom: 16 },
  textCol: { flex: 1 },
  caption: { ...type.section, marginBottom: 2 },
  title: { ...type.largeTitle },
  right: { marginLeft: 12, marginBottom: 4 },
});
