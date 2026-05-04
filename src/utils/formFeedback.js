import { Alert } from 'react-native';

export function showSuccessAndGoBack(navigation, title, message, buttonLabel = 'Aceptar') {
  Alert.alert(title, message, [
    {
      text: buttonLabel,
      onPress: () => navigation.goBack(),
    },
  ]);
}
