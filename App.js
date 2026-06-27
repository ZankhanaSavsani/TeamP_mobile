import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from './login/LoginScreen';
import DrawerNavigator from './navigation/DrawerNavigator';
import MasterEquipmentDetailScreen from './screens/MasterEquipmentDetailScreen';
import { HeaderBackButton } from '@react-navigation/elements';
import Toast from 'react-native-toast-message';
import { StatusBar } from "react-native";
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
const Stack = createStackNavigator();

const AppNavigator = () => {
  return (
    <>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName="Login"
              screenOptions={({ navigation }) => ({
                headerShown: false,
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                transitionSpec: {
                  open: { animation: 'timing', config: { duration: 300 } },
                  close: { animation: 'timing', config: { duration: 300 } },
                },
                cardStyleInterpolator: ({ current, layouts }) => ({
                  cardStyle: {
                    transform: [
                      {
                        translateX: current.progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [layouts.screen.width, 0],
                        }),
                      },
                    ],
                  },
                }),
                headerLeft: () =>
                  navigation.canGoBack() ? (
                    <HeaderBackButton onPress={() => navigation.goBack()} />
                  ) : null
              })}
            >
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Home" component={DrawerNavigator} />
              <Stack.Screen name="MasterEquipmentDetail" component={MasterEquipmentDetailScreen} options={{ title: 'Equipment Detail', headerShown: true }} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaView>
      </SafeAreaProvider>
      <Toast />
    </>
  );
};

export default AppNavigator;
