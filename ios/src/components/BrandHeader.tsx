import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { C, displayFont } from "../theme";

export default function BrandHeader({ eyebrow }: { eyebrow?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.crown}>♛</Text>
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
  crown: { color: C.gold, fontSize: 22, lineHeight: 24 },
  logo: { fontSize: 28, ...displayFont, letterSpacing: 1 },
  eyebrow: { color: C.hi, fontSize: 10, fontWeight: "900", letterSpacing: 2.4, marginTop: 5 },
});

