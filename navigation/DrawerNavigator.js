import React from 'react';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { Image, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { CommonActions } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import MasterEquipmentsScreen from '../screens/MasterEquipmentsScreen';

const Drawer = createDrawerNavigator();

const DrawerNavigator = () => {
  return (
    <Drawer.Navigator drawerContent={props => <CustomDrawerContent {...props} />}>
      <Drawer.Screen name="Dashboard" component={HomeScreen} />
      <Drawer.Screen name="Assets" component={MasterEquipmentsScreen} />
    </Drawer.Navigator>
  );
};

const drawerIcons = {
  Dashboard: require('../assets/home.png'),
  Assets: require('../assets/MasterEquipments.png'),
};

const CustomDrawerContent = (props) => {
  const drawerOrder = ['Dashboard', 'Assets'];
  const logoutIcon = require('../assets/logout.png');

  const [companyLogo, setCompanyLogo] = useState(null);

  useEffect(() => {
    let mounted = true;
    const loadLogo = async () => {
      try {
        const raw = await AsyncStorage.getItem('userInfoResponse');
        if (!raw) return;

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          parsed = raw;
        }

        const logo = parsed?.logo || parsed?.data?.logo;
        if (logo && typeof logo === 'string') {
          const normalized = logo.startsWith('data:') ? logo : `data:image/png;base64,${logo}`;
          if (mounted) setCompanyLogo(normalized);
        }
      } catch (err) {
        console.log('Logo load error', err);
      }
    };

    loadLogo();
    return () => { mounted = false; };
  }, []);

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('accessToken');
      props.navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        })
      );
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: '#ffffff' }}>
      <View style={styles.logoContainer}>
        <Image
          source={companyLogo ? { uri: companyLogo } : require('../assets/logo.png')}
          style={styles.logoImage}
        />
      </View>

      {drawerOrder.map((routeName, index) => {
        const iconName = drawerIcons[routeName];
        const displayLabel = routeName === 'Assets' ? 'Equipment' : routeName;

        return (
          <DrawerItem
            label={displayLabel}
            labelStyle={styles.labelStyle}
            icon={() => iconName && <Image source={iconName} style={{ width: 50, height: 50 }} />}
            onPress={() => props.navigation.navigate(routeName)}
            key={index}
            style={{ justifyContent: 'flex-start' }}
          />
        );
      })}

      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <Image source={logoutIcon} style={styles.logoutIcon} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </DrawerContentScrollView>
  );
};

const styles = StyleSheet.create({
  logoContainer: {
    alignItems: 'center',
    marginBottom: 0,
    paddingVertical: 8,
  },
  logoImage: {
    width: '100%',
    height: 120,
    maxWidth: 220,
    resizeMode: 'contain',
  },
  labelStyle: {
    fontSize: 18,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
  },
  logoutIcon: {
    width: 45,
    height: 45,
    marginRight: 40,
    marginLeft: 0,
  },
  logoutText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#808080',
  },
});

export default DrawerNavigator;
