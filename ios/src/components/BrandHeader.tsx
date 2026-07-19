import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { C, displayFont, type } from "../theme";
import Icon from "./Icon";

export default function BrandHeader({ eyebrow }: { eyebrow?: string }) {
  return (
    <View style={styles.wrap}>
      <Icon name="crown" size={20} color={C.gold} style={{ marginBottom: 4 }} />
      <Text style={styles.logo}>
        <Text style={{ color: C.text }}>HI-LO </Text>
        <Text style={{ color: C.gold }}>ROYALE</Text>
      </Text>
      {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginBottom: 16 },
  logo: { fontSize: 28, ...displayFont, letterSpacing: 1 },
  eyebrow: { ...type.caption, color: C.hi, letterSpacing: 2.2, marginTop: 6 },
});
