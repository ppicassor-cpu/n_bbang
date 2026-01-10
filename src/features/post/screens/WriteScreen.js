import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, Modal } from 'react-native';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { useAppContext } from '../../../app/providers/AppContext';
import { theme } from '../../../theme';
import { MaterialIcons } from '@expo/vector-icons';

export default function WriteScreen({ navigation }) {
  const { addPost, currentLocation } = useAppContext();
  
  const [title, setTitle] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [participants, setParticipants] = useState(2);
  const [selectedTip, setSelectedTip] = useState(0);
  const [images, setImages] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  const pickImages = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, 
      quality: 1,
    });

    if (!result.canceled) {
      setImages([...images, ...result.assets.map(asset => asset.uri)]);
    }
  };

  const checkTipLimit = (tipAmount) => {
    if (!buyPrice) {
      Alert.alert("알림", "구매 금액을 먼저 입력해주세요.");
      return;
    }

    const price = parseInt(buyPrice.replace(/,/g, ''), 10);
    const totalTip = tipAmount * participants;
    const limit = price * 0.1;

    if (tipAmount > 0 && totalTip > limit) {
      setModalMessage(`수고비 합계(${totalTip.toLocaleString()}원)가\n구매 금액의 10%(${limit.toLocaleString()}원)를\n초과할 수 없습니다.`);
      setModalVisible(true);
    } else {
      setSelectedTip(tipAmount);
    }
  };

  const handlePriceChange = (text) => {
    const clean = text.replace(/,/g, '');
    if (clean === '') {
      setBuyPrice('');
      return;
    }
    const num = parseInt(clean, 10);
    if (!isNaN(num)) {
      setBuyPrice(num.toLocaleString());
      setSelectedTip(0); 
    }
  };

  const handleSubmit = () => {
    if (!title || !buyPrice) return;
    const priceInt = parseInt(buyPrice.replace(/,/g, ''), 10);
    const perPerson = Math.ceil(priceInt / participants);

    const newPost = {
      id: Date.now().toString(),
      ownerId: 'me',
      category: '기타',
      title,
      location: currentLocation,
      price: priceInt,
      pricePerPerson: perPerson,
      tip: selectedTip,
      currentParticipants: 1, 
      maxParticipants: participants,
      images: images,
      status: '모집중',
    };
    addPost(newPost);
    navigation.goBack();
  };

  const priceInt = buyPrice ? parseInt(buyPrice.replace(/,/g, ''), 10) : 0;
  const perPerson = participants > 0 ? Math.ceil(priceInt / participants) : 0;
  const finalPerPerson = perPerson + selectedTip;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
          <TouchableOpacity style={styles.imageBtn} onPress={pickImages}>
            <MaterialIcons name="add-a-photo" size={30} color="grey" />
          </TouchableOpacity>
          {images.map((uri, idx) => (
            <Image key={idx} source={{ uri }} style={styles.imagePreview} />
          ))}
        </ScrollView>

        <TextInput 
          style={styles.input} 
          placeholder="상품명 (제목)" 
          placeholderTextColor="grey"
          value={title}
          onChangeText={setTitle}
        />
        
        <View style={styles.inputRow}>
          <TextInput 
            style={[styles.input, { flex: 1, fontSize: 20, color: theme.primary, fontWeight: 'bold' }]} 
            placeholder="구매 금액" 
            placeholderTextColor="grey"
            keyboardType="numeric"
            value={buyPrice}
            onChangeText={handlePriceChange}
          />
          <Text style={styles.unitText}>원</Text>
        </View>

        <View style={{ marginTop: 30 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.label}>참여 인원</Text>
            <View style={styles.pBadge}>
              <Text style={styles.pText}>{participants}명</Text>
            </View>
          </View>
          <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={2}
            maximumValue={10}
            step={1}
            minimumTrackTintColor={theme.primary}
            maximumTrackTintColor="#555"
            thumbTintColor={theme.primary}
            value={participants}
            onValueChange={(v) => { setParticipants(v); setSelectedTip(0); }}
          />
        </View>

        <View style={{ marginTop: 30 }}>
          <Text style={styles.label}>방장 수고비</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {[0, 500, 1000, 1500, 2000].map(tip => (
              <TouchableOpacity 
                key={tip} 
                style={[styles.tipBtn, selectedTip === tip && styles.tipBtnSelected]}
                onPress={() => checkTipLimit(tip)}
              >
                <Text style={[styles.tipText, selectedTip === tip && { color: 'black' }]}>
                  {tip === 0 ? '무료봉사' : `${tip}`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.receipt}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 18 }}>🧾 </Text>
            <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>N빵 예상 계산서</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={{ color: 'grey' }}>1인당 물건값</Text>
            <Text style={{ color: 'white' }}>{perPerson.toLocaleString()}원</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={{ color: 'grey' }}>수고비</Text>
            <Text style={{ color: theme.primary, fontWeight: 'bold' }}>+ {selectedTip.toLocaleString()}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: 'grey', marginVertical: 12 }} />
          <View style={styles.receiptRow}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>최종 1인</Text>
            <Text style={{ color: theme.primary, fontSize: 24, fontWeight: 'bold' }}>{finalPerPerson.toLocaleString()}원</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={{ fontSize: 18, fontWeight: 'bold' }}>완료</Text>
        </TouchableOpacity>

      </ScrollView>

      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <MaterialIcons name="warning" size={24} color="orange" />
              <Text style={{ color: 'white', fontSize: 18, marginLeft: 8, fontWeight: 'bold' }}>수고비 한도 초과</Text>
            </View>
            <Text style={{ color: '#DDD', lineHeight: 22 }}>{modalMessage}</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalVisible(false)}>
              <Text style={{ color: theme.primary, fontWeight: 'bold' }}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  imageBtn: { width: 80, height: 80, borderColor: '#444', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  imagePreview: { width: 80, height: 80, borderRadius: 12, marginRight: 10 },
  input: { borderBottomWidth: 1, borderBottomColor: '#444', paddingVertical: 10, color: 'white', fontSize: 16, marginBottom: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#444' },
  unitText: { color: 'white', fontSize: 18, marginLeft: 8 },
  label: { color: theme.primary, fontSize: 16, fontWeight: 'bold' },
  pBadge: { backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  pText: { color: 'black', fontWeight: 'bold', fontSize: 16 },
  tipBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#333', marginRight: 10 },
  tipBtnSelected: { backgroundColor: theme.primary },
  tipText: { color: 'white', fontWeight: 'bold' },
  receipt: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 20, marginTop: 30, borderWidth: 1, borderColor: 'rgba(204, 255, 0, 0.5)' },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  submitBtn: { backgroundColor: theme.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#2C2C2C', borderRadius: 16, padding: 24 },
  modalBtn: { alignSelf: 'flex-end', marginTop: 20 },
});
