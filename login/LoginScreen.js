import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Image,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  StatusBar
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import OAuthManager from './OAuthManager';
import Toast from 'react-native-toast-message';

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Toast.show({
        type: 'error',
        text1: 'Login Error',
        text2: 'Please enter username and password',
      });
      return;
    }

    try {
      const accessToken = await OAuthManager.authenticate(username, password);
      setLoginSuccess(true);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Home', params: { accessToken } }],
        })
      );
      Toast.show({
        type: 'success',
        text1: 'Login Successful',
        text2: 'You have been successfully logged in!',
      });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Login failed',
        text2: 'Invalid Credentials',
      });
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        resetScrollToCoords={{ x: 0, y: 0 }}
        scrollEnabled
        extraScrollHeight={100}
        enableOnAndroid={true}  // Add this
        enableAutomaticScroll={true}  // Add this too
      >

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.innerContainer}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
            />
            <TextInput
              style={[
                styles.input,
                styles.inputBackground,
                usernameFocused && styles.inputFocused
              ]}
              placeholder="Username"
              placeholderTextColor="gray"
              onChangeText={text => setUsername(text)}
              value={username}
              autoCapitalize="none"
              onFocus={() => setUsernameFocused(true)}
              onBlur={() => setUsernameFocused(false)}
            />
            <TextInput
              style={[
                styles.input,
                styles.inputBackground,
                passwordFocused && styles.inputFocused
              ]}
              placeholder="Password"
              placeholderTextColor="gray"
              onChangeText={text => setPassword(text)}
              autoCapitalize="none"
              value={password}
              secureTextEntry
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
            >
              <Text style={styles.loginButtonText}>Login</Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAwareScrollView>
      <Toast />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  innerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    width: '60%',
    height: 180,
    resizeMode: 'contain',
    marginBottom: 20,
  },
  input: {
    width: '80%',
    height: 50,
    borderWidth: 1,
    borderColor: '#b4b4b4',
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 20,
    color: '#000',
  },
  inputBackground: {
    backgroundColor: '#fff',
  },
  inputFocused: {
    borderColor: '#3f4ff8',
  },
  loginButton: {
    width: '80%',
    height: 50,
    backgroundColor: '#3f4ff8',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
    elevation: 3,
    marginTop: 20,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
