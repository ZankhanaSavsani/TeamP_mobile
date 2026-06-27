import axios from 'axios';
import { encode } from 'base-64';
import AsyncStorage from '@react-native-async-storage/async-storage';

const clientID = '78du9kdz95vb3hx87b';
const clientSecret = 'qw78xa8gbb38axv0pl';

const accessTokenUri = 'https://secure.fiscalox.com/oauth/token';
const accessTokenKey = 'accessToken';
const instanceKey = 'instance';
const userIdKey = 'userId';
const employeeIdKey = 'employeeId';


const OAuthManager = {
  authenticate: async (username, password) => {
    try {
      const credentials = encode(`${clientID}:${clientSecret}`);
      const formBody = new URLSearchParams();
      formBody.append('grant_type', 'password');
      formBody.append('username', username);
      formBody.append('password', password);

      const response = await axios.post(accessTokenUri, formBody.toString(), {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      });

      const { access_token, instance, } = response.data;
      await AsyncStorage.setItem(accessTokenKey, access_token);
      await AsyncStorage.setItem(instanceKey, instance);


      console.log('Instance Type:', instance);


      // const userInfoEndpoint = instance_type === 'Sandbox'
      //   ? 'https://dev.fiscalox.com/api/user_info'
      //   : 'https://app.fiscalox.com/api/user_info';

      const userInfoEndpoint = (() => {
        if (instance === 'developerox') {
          return 'https://dev.developerox.com/api/user_info';
        }

        if (instance.startsWith('dev-')) {
          const region = instance.split('-')[1];
          return `https://${region}.developerox.com/api/user_info`;
        }

        return `https://${instance.toLowerCase()}.fiscalox.com/api/user_info`;
      })();


      const userInfoResponse = await axios.get(userInfoEndpoint, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      });
      console.log('Info Response:', userInfoResponse);
      const { userId, isCheckedIn } = userInfoResponse.data;
      const employeeId =
        userInfoResponse.data?.employeeId 
        '';
      // Save full user info response so other screens (Home) can read pageAccess and other details
      try {
        await AsyncStorage.setItem('userInfoResponse', JSON.stringify(userInfoResponse.data));
      } catch (e) {
        console.warn('Failed to store userInfoResponse in AsyncStorage', e);
      }
      await AsyncStorage.setItem(userIdKey, userId);
      await AsyncStorage.setItem(employeeIdKey, employeeId ? String(employeeId) : '');

      console.log('User ID:', userId);
      if (!employeeId) {
        console.warn('Employee ID is empty. userInfoResponse.data:', userInfoResponse.data);
      }
      console.log('Employee ID:', employeeId);



      return access_token;
    } catch (error) {
      console.error('OAuth authentication error:', error);
      throw error;
    }
  },

  getAccessToken: async () => {
    try {
      const accessToken = await AsyncStorage.getItem(accessTokenKey);
      return accessToken;
    } catch (error) {
      console.error('Error retrieving access token:', error);
      throw error;
    }
  },

  clearAccessToken: async () => {
    try {
      await AsyncStorage.removeItem(accessTokenKey);
      await AsyncStorage.removeItem(instanceKey);
      await AsyncStorage.removeItem(userIdKey);
      await AsyncStorage.removeItem(employeeIdKey);
    } catch (error) {
      console.error('Error clearing access token:', error);
      throw error;
    }
  },

  getUserId: async () => {
    try {
      const userId = await AsyncStorage.getItem(userIdKey);
      console.log('Retrieved User ID:', userId);
      return userId;
    } catch (error) {
      console.error('Error retrieving user ID:', error);
      throw error;
    }
  },

  getEmployeeId: async () => {
    try {
      const employeeId = await AsyncStorage.getItem(employeeIdKey);
      console.log('Retrieved Employee ID:', employeeId);
      return employeeId;
    } catch (error) {
      console.error('Error retrieving employee ID:', error);
      throw error;
    }
  },

  getInstance: async () => {
    try {
      const instance = await AsyncStorage.getItem(instanceKey);
      return instance;
    } catch (error) {
      console.error('Error retrieving instance:', error);
      throw error;
    }
  },

  getInstanceType: async () => {
    try {
      const instance = await AsyncStorage.getItem(instanceKey);
      return instance;
    } catch (error) {
      console.error('Error retrieving instance:', error);
      throw error;
    }
  }
};

export default OAuthManager;
