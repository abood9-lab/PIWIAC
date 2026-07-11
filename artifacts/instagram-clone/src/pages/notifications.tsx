import { useGetNotifications, useMarkAllNotificationsRead, getGetNotificationsQueryKey } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, UserPlus, Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePushNotifications } from "@/lib/push-notifications";
import { useToast } from "@/hooks/use-toast";

function PushNotificationBanner() {
  const { isSupported, permission, isSubscribed, isBusy, subscribe, unsubscribe } = usePushNotifications();
  const { toast } = useToast();

  if (!isSupported || permission === "denied" || isSubscribed) return null;

  return (
    <div className="flex items-center gap-3 p-4 mb-4 rounded-xl border border-border bg-card sm:mx-0 mx-4">
      <BellRing className="w-8 h-8 shrink-0 text-primary" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">فعّل إشعارات المتصفح</p>
        <p className="text-muted-foreground">استلم إشعارات الرسائل والإعجابات والمتابعين حتى وأنت خارج الموقع.</p>
      </div>
      <Button
        size="sm"
        disabled={isBusy}
        onClick={async () => {
          const ok = await subscribe();
          toast({
            title: ok ? "تم تفعيل الإشعارات" : "تعذّر التفعيل",
            description: ok
              ? "ستصلك الإشعارات حتى خارج الموقع."
              : "يرجى السماح بالإشعارات من إعدادات المتصفح.",
            variant: ok ? "default" : "destructive",
          });
        }}
      >
        تفعيل
      </Button>
    </div>
  );
}

export default function Notifications() {
  const { data: notificationsData, isLoading } = useGetNotifications();
  const markReadMutation = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (notificationsData?.some((n: any) => !n.isRead)) {
      markReadMutation.mutateAsync().then(() => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      });
    }
  }, [notificationsData]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading notifications...</div>;
  }

  const notifications = notificationsData || [];

  return (
    <div className="max-w-2xl mx-auto w-full pt-4 pb-20 md:pb-8 sm:px-4">
      <h1 className="font-semibold text-2xl mb-6 px-4 sm:px-0">Notifications</h1>

      <PushNotificationBanner />

      {notifications.length === 0 ? (
        <div className="text-center p-12 text-muted-foreground">
          <Heart className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-1 bg-card sm:border border-border sm:rounded-xl overflow-hidden">
          {notifications.map((notif: any) => (
            <div key={notif.id} className="flex items-center gap-4 p-4 hover:bg-secondary/50 transition-colors">
              <Link href={`/profile/${notif.actor.username}`} className="shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={notif.actor.avatarUrl || undefined} />
                  <AvatarFallback>{notif.actor.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </Link>
              
              <div className="flex-1 text-sm">
                <Link href={`/profile/${notif.actor.username}`} className="font-semibold hover:underline mr-1">
                  {notif.actor.username}
                </Link>
                <span className="text-muted-foreground">
                  {notif.type === 'like' && "liked your post."}
                  {notif.type === 'comment' && `commented: "${notif.commentText}"`}
                  {notif.type === 'follow' && "started following you."}
                  {notif.type === 'message' && "sent you a message."}
                </span>
                <span className="text-xs text-muted-foreground block mt-1">
                  {formatDistanceToNow(new Date(notif.createdAt))} ago
                </span>
              </div>

              {notif.postMediaUrl && (
                <Link href={`/post/${notif.postId}`} className="shrink-0 block w-10 h-10 bg-secondary rounded-sm overflow-hidden">
                  <img src={notif.postMediaUrl} alt="" className="w-full h-full object-cover" />
                </Link>
              )}
              
              {notif.type === 'follow' && (
                <Button size="sm" variant={notif.actor.isFollowing ? "secondary" : "default"} className="h-8 shrink-0">
                  {notif.actor.isFollowing ? "Following" : "Follow"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
