import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../../theme';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';

export default function LoginScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <MaterialIcons name="shopping-basket" size={80} color={theme.primary} />
      <Text style={styles.title}>N빵</Text>
      <Text style={styles.subtitle}>우리 동네 공동구매 커뮤니티</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#FEE500' }]} onPress={() => navigation.replace('Home')}>
          <FontAwesome name="comment" size={20} color="black" />
          <Text style={[styles.btnText, { color: 'black' }]}>카카오로 3초 만에 시작하기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, { backgroundColor: 'white' }]} onPress={() => navigation.replace('Home')}>
          <FontAwesome name="google" size={20} color="black" />
          <Text style={[styles.btnText, { color: 'black' }]}>구글 계정으로 시작하기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'grey' }]} onPress={() => navigation.replace('Home')}>
          <Text style={[styles.btnText, { color: 'white' }]}>이메일로 시작하기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: theme.primary, marginTop: 20 },
  subtitle: { color: theme.textDim, fontSize: 16, marginBottom: 60 },
  buttonContainer: { width: '100%', gap: 12 },
  btn: { flexDirection: 'row', height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnText: { fontSize: 16, fontWeight: 'bold' },
});
