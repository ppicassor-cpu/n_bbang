import React, { createContext, useState, useContext } from 'react';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [currentLocation, setCurrentLocation] = useState('내동');
  const [myPoints, setMyPoints] = useState(50000);
  const [posts, setPosts] = useState([
    {
      id: '1',
      ownerId: 'other_user',
      category: '대형마트',
      title: '코스트코 소고기 소분해요',
      location: '내동',
      pickup_point: '현대아파트 정문',
      price: 30000, 
      pricePerPerson: 15000,
      tip: 1000,
      currentParticipants: 2,
      maxParticipants: 4,
      images: [],
      status: '모집중',
      content: '소고기 반 나누실 분!',
    },
  ]);

  const addPost = (newPost) => {
    setPosts([newPost, ...posts]);
  };

  return (
    <AppContext.Provider value={{ currentLocation, setCurrentLocation, myPoints, posts, addPost }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
