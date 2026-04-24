import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import HelpAccessScreen from "./src/screens/HelpAccessScreen";
import LoginScreen from "./src/screens/LoginScreen";
import MainAppScreen from "./src/screens/MainAppScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import { COLORS } from "./src/theme/luxiaTheme";
import { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="HelpAccess" component={HelpAccessScreen} />
        <Stack.Screen name="MainApp" component={MainAppScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
