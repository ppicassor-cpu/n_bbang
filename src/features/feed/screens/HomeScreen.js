import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useAppContext } from '../../../app/providers/AppContext';
import { theme } from '../../../theme';
import { MaterialIcons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }) {
  const { posts, currentLocation } = useAppContext();

  const renderItem = ({ item }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;
    
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Detail', { post: item })}>
        <View style={styles.imageBox}>
          {item.images && item.images.length > 0 ? (
             <Image source={{ uri: item.images[0] }} style={styles.image} />
          ) : (
             <MaterialIcons name="shopping-bag" size={40} color="grey" />
          )}
        </View>
        
        <View style={styles.infoBox}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.subInfo}>{item.location}  {item.category}</Text>
          
          <View style={styles.row}>
            <Text style={styles.price}>{item.pricePerPerson.toLocaleString()}원</Text>
            {item.tip > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>수고비 포함</Text>
              </View>
            )}
          </View>
          
          <Text style={[styles.status, { color: isFull ? theme.danger : 'grey' }]}>
            {isFull ? "마감" : `${item.currentParticipants}/${item.maxParticipants}명 참여중`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.location}>{currentLocation} </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
           <MaterialIcons name="person-outline" size={28} color="white" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#333', marginVertical: 16 }} />}
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Write')}>
        <MaterialIcons name="edit" size={24} color="black" />
        <Text style={styles.fabText}>글쓰기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center' },
  location: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  card: { flexDirection: 'row' },
  imageBox: { width: 100, height: 100, backgroundColor: '#222', borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  infoBox: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  title: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  subInfo: { color: 'grey', fontSize: 13, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  price: { color: 'white', fontSize: 18, fontWeight: 'bold', marginRight: 8 },
  badge: { backgroundColor: 'rgba(204, 255, 0, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: theme.primary, fontSize: 11, fontWeight: 'bold' },
  status: { fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: theme.primary, flexDirection: 'row', padding: 16, borderRadius: 30, alignItems: 'center', elevation: 5 },
  fabText: { fontWeight: 'bold', marginLeft: 8 },
});
