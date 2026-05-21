import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';

import { useAppTheme } from '../context/ThemeContext';
import CalendarScreen from '../screens/CalendarScreen';
import CaseDetailScreen from '../screens/CaseDetailScreen';
import CasesScreen from '../screens/CasesScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DocumentsScreen from '../screens/DocumentsScreen';
import LiveTranscriptionScreen from '../screens/LiveTranscriptionScreen';
import MoreScreen from '../screens/MoreScreen';
import NewCaseScreen from '../screens/NewCaseScreen';
import NewHearingScreen from '../screens/NewHearingScreen';
import NewTaskScreen from '../screens/NewTaskScreen';
import TranscriptionTestScreen from '../screens/TranscriptionTestScreen';
import UploadDocumentScreen from '../screens/UploadDocumentScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function DashboardTabs() {
  const { colors } = useAppTheme();
  const icons = useMemo(
    () => ({
      Inicio: 'view-dashboard-outline',
      Causas: 'briefcase-outline',
      Calendario: 'calendar-month-outline',
      Documentos: 'file-document-outline',
      Mas: 'dots-horizontal-circle-outline',
    }),
    []
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: 72,
          paddingBottom: 10,
          paddingTop: 10,
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.borderSoft,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.18,
          shadowRadius: 20,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons color={color} name={icons[route.name]} size={size + 2} />
        ),
      })}
    >
      <Tab.Screen component={DashboardScreen} name="Inicio" />
      <Tab.Screen component={CasesScreen} name="Causas" />
      <Tab.Screen component={CalendarScreen} name="Calendario" />
      <Tab.Screen component={DocumentsScreen} name="Documentos" />
      <Tab.Screen component={MoreScreen} name="Mas" options={{ title: 'Mas' }} />
    </Tab.Navigator>
  );
}

export default function DashboardNavigator() {
  const { colors } = useAppTheme();

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
      <Stack.Screen component={NewHearingScreen} name="NewHearing" options={{ title: 'Registrar audiencia' }} />
      <Stack.Screen component={NewTaskScreen} name="NewTask" options={{ title: 'Registrar tarea' }} />
      <Stack.Screen
        component={TranscriptionTestScreen}
        name="TranscriptionTest"
        options={{ title: 'Transcripción de audiencia' }}
      />
      <Stack.Screen
        component={LiveTranscriptionScreen}
        name="LiveTranscription"
        options={{ title: 'Transcripción en vivo' }}
      />
      <Stack.Screen component={UploadDocumentScreen} name="UploadDocument" options={{ title: 'Subir documento' }} />
    </Stack.Navigator>
  );
}
