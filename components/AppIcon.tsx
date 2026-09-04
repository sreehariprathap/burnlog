import { BurnLogMark } from '@/components/BurnLogMark';
import { LogbookMark } from '@/components/LogbookMark';
import { MoneyLogMark } from '@/components/MoneyLogMark';
import { TaskLogMark } from '@/components/TaskLogMark';
import { HomeLogMark } from '@/components/HomeLogMark';
import { SocialLogMark } from '@/components/SocialLogMark';
import { ShoppingLogMark } from '@/components/ShoppingLogMark';
import { TravelLogMark } from '@/components/TravelLogMark';
import { LearnLogMark } from '@/components/LearnLogMark';
import { AdminLogMark } from '@/components/AdminLogMark';
import { IntelLogMark } from '@/components/IntelLogMark';
import type { AppId } from '@/lib/appMode';

export function AppIcon({ id, size }: { id: AppId; size: number }) {
  switch (id) {
    case 'logbook':
      return <LogbookMark size={size} />;
    case 'moneylog':
      return <MoneyLogMark size={size} />;
    case 'tasklog':
      return <TaskLogMark size={size} />;
    case 'homelog':
      return <HomeLogMark size={size} />;
    case 'sociallog':
      return <SocialLogMark size={size} />;
    case 'shoppinglog':
      return <ShoppingLogMark size={size} />;
    case 'travellog':
      return <TravelLogMark size={size} />;
    case 'learnlog':
      return <LearnLogMark size={size} />;
    case 'adminlog':
      return <AdminLogMark size={size} />;
    case 'intellog':
      return <IntelLogMark size={size} />;
    default:
      return <BurnLogMark size={size} />;
  }
}
