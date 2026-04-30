import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import colors from '../constants/colors';
import CalendarScreen from '../screens/CalendarScreen';
import CaseDetailScreen from '../screens/CaseDetailScreen';
import CasesScreen from '../screens/CasesScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DocumentsScreen from '../screens/DocumentsScreen';
import MoreScreen from '../screens/MoreScreen';
import NewCaseScreen from '../screens/NewCaseScreen';
import NewHearingScreen from '../screens/NewHearingScreen';
import UploadDocumentScreen from '../screens/UploadDocumentScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function DashboardTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#8A96A8',
        tabBarStyle: {
          height: 72,
          paddingBottom: 10,
          paddingTop: 10,
          backgroundColor: colors.card,
          borderTopWidth: 0,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.08,
          shadowRadius: 20,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Inicio: 'view-dashboard-outline',
            Causas: 'briefcase-outline',
            Calendario: 'calendar-month-outline',
            Documentos: 'file-document-outline',
            Más: 'dots-horizontal-circle-outline',
          };

          return <MaterialCommunityIcons color={color} name={icons[route.name]} size={size + 2} />;
        },
      })}
    >
      <Tab.Screen component={DashboardScreen} name="Inicio" />
      <Tab.Screen component={CasesScreen} name="Causas" />
      <Tab.Screen component={CalendarScreen} name="Calendario" />
      <Tab.Screen component={DocumentsScreen} name="Documentos" />
      <Tab.Screen component={MoreScreen} name="Más" />
    </Tab.Navigator>
  );
}

export default function DashboardNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '700',
        },
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: colors.background,
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen component={DashboardTabs} name="MainTabs" options={{ headerShown: false }} />
      <Stack.Screen component={CaseDetailScreen} name="CaseDetail" options={{ title: 'Detalle de causa' }} />
      <Stack.Screen component={NewCaseScreen} name="NewCase" options={{ title: 'Nueva causa' }} />
      <Stack.Screen component={NewHearingScreen} name="NewHearing" options={{ title: 'Programar audiencia' }} />
      <Stack.Screen component={UploadDocumentScreen} name="UploadDocument" options={{ title: 'Subir documento' }} />
    </Stack.Navigator>
  );
}
