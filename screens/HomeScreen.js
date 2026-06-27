import React, { useEffect } from 'react';
import { ScrollView, View, Text, Image, TouchableOpacity, StyleSheet, StatusBar, BackHandler } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

const HomeScreen = ({ navigation }) => {
  const isFocused = useIsFocused();

  useEffect(() => {
    const backAction = () => {
      navigation.navigate('Dashboard');
      return true;
    };

    if (isFocused) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }
  }, [isFocused, navigation]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <ScrollView contentContainerStyle={styles.scrollView}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.buttonContainer} onPress={() => navigation.navigate('Assets')}>
            <View style={styles.iconContainer}>
              <Image source={require('../assets/MasterEquipments.png')} style={styles.icon} />
            </View>
            <Text style={styles.label}>Equipment</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 20,
    paddingHorizontal: 10,
  },
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  buttonContainer: {
    alignItems: 'center',
    marginBottom: 20,
    width: '48%',
  },
  iconContainer: {
    width: 150,
    height: 150,
    backgroundColor: '#E8E8E8',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
  },
  label: {
    fontSize: 20,
    marginTop: 8,
    textAlign: 'center',
    color: '#000000',
  },
});

export default HomeScreen;
